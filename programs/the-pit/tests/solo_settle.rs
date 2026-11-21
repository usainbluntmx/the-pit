//! `settle_solo` en LiteSVM: las tres ramas del payout, sin devnet.
//!
//!   cargo test -p the-pit --test solo_settle -- --nocapture

use anchor_lang::solana_program::{instruction::Instruction, pubkey::Pubkey, system_program};
use anchor_lang::{AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use the_pit::state::{Arena, ArenaStatus, PitResult};

const NONCE: &str = "solo1";
const ENTRY: u64 = 10_000_000; // 0.01 SOL

struct Harness {
    svm: LiteSVM,
    payer: Keypair,
    arena: Pubkey,
    vault: Pubkey,
    house: Pubkey,
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) {
    let tx = Transaction::new(
        &[payer],
        Message::new(&[ix], Some(&payer.pubkey())),
        svm.latest_blockhash(),
    );
    match svm.send_transaction(tx) {
        Ok(_) => {}
        Err(e) => panic!("tx failed: {:?}\nlogs: {:?}", e.err, e.meta.logs),
    }
}

fn setup() -> Harness {
    let mut svm = LiteSVM::new();
    let so = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/the_pit.so"
    ))
    .expect("compila el programa antes: anchor build");
    let program_id = the_pit::ID;
    svm.add_program(program_id, &so);

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    let (arena, _) = Pubkey::find_program_address(&[b"arena", NONCE.as_bytes()], &program_id);
    let (vault, _) = Pubkey::find_program_address(&[b"vault", arena.as_ref()], &program_id);
    let (house, _) = Pubkey::find_program_address(&[b"house"], &program_id);
    let feed = Pubkey::new_unique();

    send(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: the_pit::accounts::CreateArena {
                creator: payer.pubkey(),
                arena,
                vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: the_pit::instruction::CreateArena {
                nonce: NONCE.to_string(),
                entry_fee: ENTRY,
                duration_secs: 300,
                max_players: 1,
                rake_bps: 0,
                feed,
            }
            .data(),
        },
    );

    send(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: the_pit::accounts::JoinArena {
                player: payer.pubkey(),
                arena,
                vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: the_pit::instruction::JoinArena {
                _nonce: NONCE.to_string(),
            }
            .data(),
        },
    );

    send(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: the_pit::accounts::LockArena {
                creator: payer.pubkey(),
                arena,
            }
            .to_account_metas(None),
            data: the_pit::instruction::LockArena {
                _nonce: NONCE.to_string(),
            }
            .data(),
        },
    );

    svm.airdrop(&house, 3_000_000_000).unwrap();

    Harness {
        svm,
        payer,
        arena,
        vault,
        house,
    }
}

/// Rewrites the settled result so each test picks the payout branch.
fn force_result(h: &mut Harness, equity: i64) {
    let mut acc = h.svm.get_account(&h.arena).expect("arena");
    let mut state = Arena::try_deserialize(&mut &acc.data[..]).unwrap();
    state.status = ArenaStatus::Settled;
    state.winner_count = 1;
    state.results = [
        PitResult {
            player: h.payer.pubkey(),
            equity,
        },
        PitResult::default(),
        PitResult::default(),
    ];
    state.try_serialize(&mut &mut acc.data[..]).unwrap();
    h.svm.set_account(h.arena, acc).unwrap();
}

fn settle_solo(h: &mut Harness) {
    let program_id = the_pit::ID;
    send(
        &mut h.svm,
        &h.payer,
        Instruction {
            program_id,
            accounts: the_pit::accounts::SettleSolo {
                arena: h.arena,
                vault: h.vault,
                house: h.house,
                player: h.payer.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: the_pit::instruction::SettleSolo {
                _nonce: NONCE.to_string(),
            }
            .data(),
        },
    );
}

fn closed(h: &Harness) {
    let acc = h.svm.get_account(&h.arena).expect("arena");
    let state = Arena::try_deserialize(&mut &acc.data[..]).unwrap();
    assert_eq!(state.status, ArenaStatus::Closed);
}

#[test]
fn solo_win_pays_from_vault_and_house() {
    let mut h = setup();
    let player_before = h.svm.get_balance(&h.payer.pubkey()).unwrap();
    let house_before = h.svm.get_balance(&h.house).unwrap();

    // 1,200 credits -> 2× entry: vault returns 0.01, house adds 0.01.
    force_result(&mut h, 1_200_000_000_000);
    settle_solo(&mut h);

    let player_after = h.svm.get_balance(&h.payer.pubkey()).unwrap();
    let house_after = h.svm.get_balance(&h.house).unwrap();
    println!("win: player +{} house {}", player_after - player_before, house_after as i64 - house_before as i64);
    assert!(player_after > player_before + 19_000_000, "payout should be ~0.02 SOL");
    assert_eq!(house_before - house_after, ENTRY);
    closed(&h);
}

#[test]
fn solo_loss_feeds_the_house() {
    let mut h = setup();
    let player_before = h.svm.get_balance(&h.payer.pubkey()).unwrap();
    let house_before = h.svm.get_balance(&h.house).unwrap();

    // 900 credits -> 0×: the entry stays with the house.
    force_result(&mut h, 900_000_000_000);
    settle_solo(&mut h);

    let player_after = h.svm.get_balance(&h.payer.pubkey()).unwrap();
    let house_after = h.svm.get_balance(&h.house).unwrap();
    println!("loss: player {} house +{}", player_after as i64 - player_before as i64, house_after - house_before);
    assert!(player_after < player_before, "the player only pays the fee");
    assert_eq!(house_after - house_before, ENTRY);
    closed(&h);
}

#[test]
fn solo_break_even_returns_the_entry() {
    let mut h = setup();
    let player_before = h.svm.get_balance(&h.payer.pubkey()).unwrap();
    let house_before = h.svm.get_balance(&h.house).unwrap();

    force_result(&mut h, 1_000_000_000_000);
    settle_solo(&mut h);

    let player_after = h.svm.get_balance(&h.payer.pubkey()).unwrap();
    let house_after = h.svm.get_balance(&h.house).unwrap();
    println!("even: player +{} house delta {}", player_after - player_before, house_after as i64 - house_before as i64);
    assert!(player_after > player_before + 9_000_000, "entry comes back minus the fee");
    assert_eq!(house_after, house_before);
    closed(&h);
}

#[test]
fn settle_refuses_a_solo_arena() {
    let mut h = setup();
    force_result(&mut h, 1_100_000_000_000);
    let program_id = the_pit::ID;
    let tx = Transaction::new(
        &[&h.payer],
        Message::new(
            &[Instruction {
                program_id,
                accounts: the_pit::accounts::Settle {
                    arena: h.arena,
                    vault: h.vault,
                    creator: h.payer.pubkey(),
                    system_program: system_program::ID,
                }
                .to_account_metas(None),
                data: the_pit::instruction::Settle {
                    _nonce: NONCE.to_string(),
                }
                .data(),
            }],
            Some(&h.payer.pubkey()),
        ),
        h.svm.latest_blockhash(),
    );
    assert!(h.svm.send_transaction(tx).is_err(), "multi settle must reject a solo arena");
}
