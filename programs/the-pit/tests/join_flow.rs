//! Ciclo mínimo en LiteSVM: crear arena y sentarse. Sin devnet, sin deploys.
//!
//!   cargo test -p the-pit --test join_flow -- --nocapture

use anchor_lang::solana_program::{instruction::Instruction, pubkey::Pubkey, system_program};
use solana_message::Message;
use solana_transaction::Transaction;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_signer::Signer;

const NONCE: &str = "local1";

fn program_id() -> Pubkey {
    the_pit::ID
}

#[test]
fn create_then_join() {
    let mut svm = LiteSVM::new();
    let so = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/the_pit.so"
    ))
    .expect("compila el programa antes: anchor build");
    svm.add_program(program_id(), &so);

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    let (arena, _) = Pubkey::find_program_address(&[b"arena", NONCE.as_bytes()], &program_id());
    let (vault, _) = Pubkey::find_program_address(&[b"vault", arena.as_ref()], &program_id());
    let feed = Pubkey::new_unique();

    let create = Instruction {
        program_id: program_id(),
        accounts: the_pit::accounts::CreateArena {
            creator: payer.pubkey(),
            arena,
            vault,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: the_pit::instruction::CreateArena {
            nonce: NONCE.to_string(),
            entry_fee: 10_000_000,
            duration_secs: 300,
            max_players: 8,
            rake_bps: 0,
            feed,
        }
        .data(),
    };

    let tx = Transaction::new(
        &[&payer],
        Message::new(&[create], Some(&payer.pubkey())),
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx)
        .map_err(|e| format!("create: {:?}", e))
        .unwrap();
    println!("arena creada: {arena}");

    let join = Instruction {
        program_id: program_id(),
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
    };

    let tx = Transaction::new(
        &[&payer],
        Message::new(&[join], Some(&payer.pubkey())),
        svm.latest_blockhash(),
    );
    match svm.send_transaction(tx) {
        Ok(_) => println!("join OK"),
        Err(e) => panic!("join falló: {:?}\nlogs: {:?}", e.err, e.meta.logs),
    }

    let acc = svm.get_account(&arena).expect("arena account");
    let decoded = the_pit::state::Arena::try_deserialize(&mut &acc.data[..]).unwrap();
    println!("players={} max={}", decoded.player_count, decoded.max_players);
    assert_eq!(decoded.player_count, 1);
    assert_eq!(decoded.max_players, 8);
}
