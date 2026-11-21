//! PIT — Private Instant Trading.
//!
//! Competitive trading arenas on Solana + MagicBlock.
//!
//! Lifecycle:
//!   base   `create_arena` -> `join_arena`* -> `lock_arena`
//!   base   `delegate_arena`  (account ownership moves to the Delegation Program)
//!   ER     `open_position` / `close_position`  (gasless, ~10ms, oracle-priced)
//!   ER     `end_round` -> `commit_round`  (commit + undelegate back to base)
//!   base   `settle`  (escrow pays the podium)

pub mod constants;
pub mod error;
pub mod state;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::system_program::{self, Transfer};
use ephemeral_rollups_sdk::access_control::{
    instructions::{
        CloseEphemeralPermissionCpi, CreateEphemeralPermissionCpi, UpdateEphemeralPermissionCpi,
    },
    structs::{
        EphemeralMembersArgs, EphemeralPermission, Member, PERMISSION_SEED, TX_BALANCES_FLAG,
        TX_LOGS_FLAG, TX_MESSAGE_FLAG,
    },
};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::vrf::{
    self,
    instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams},
    types::SerializableAccountMeta,
};

pub use constants::*;
pub use error::*;
pub use state::*;

declare_id!("4iVtfWTrVo4iUAeTBVhhjkDr9kGK4dTD95vKM8c6dbar");

#[event]
pub struct ArenaOpened {
    pub arena: Pubkey,
    pub feed: Pubkey,
    pub entry_fee: u64,
}

#[event]
pub struct Madness {
    pub arena: Pubkey,
    pub seat: u8,
    pub until: i64,
    pub pressure: u8,
}

#[event]
pub struct MadTrade {
    pub arena: Pubkey,
    pub seat: u8,
    /// Lo que pidió el agente.
    pub wanted: i8,
    /// Lo que ejecutó el pozo.
    pub executed: i8,
}

#[event]
pub struct SeriesOpened {
    pub series: Pubkey,
    pub creator: Pubkey,
    pub max_rounds: u8,
}

#[event]
pub struct SeriesRoundRecorded {
    pub series: Pubkey,
    pub arena: Pubkey,
    pub round_no: u8,
}

#[event]
pub struct SeatTaken {
    pub arena: Pubkey,
    pub player: Pubkey,
    pub pot: u64,
}

#[event]
pub struct PositionOpened {
    pub arena: Pubkey,
    pub player: Pubkey,
    pub side: i8,
    pub notional: u64,
    pub entry_price: u64,
}

#[event]
pub struct PositionClosed {
    pub arena: Pubkey,
    pub player: Pubkey,
    pub pnl: i64,
    pub exit_price: u64,
}

#[event]
pub struct ShockApplied {
    pub arena: Pubkey,
    pub seat: u8,
    pub price: u64,
    /// Shock number for this round, so clients can order the kill feed.
    pub count: u8,
}

#[event]
pub struct RoundSettled {
    pub arena: Pubkey,
    pub winner: Pubkey,
    pub pot: u64,
    pub winner_count: u8,
}

#[ephemeral]
#[program]
pub mod the_pit {
    use super::*;

    /// Create an arena on the base layer. The escrow vault is a system-owned PDA
    /// seeded by the arena key, funded here so it stays rent exempt.
    pub fn create_arena(
        ctx: Context<CreateArena>,
        nonce: String,
        entry_fee: u64,
        duration_secs: i64,
        max_players: u8,
        rake_bps: u16,
        feed: Pubkey,
    ) -> Result<()> {
        validate_nonce(&nonce)?;
        require!(entry_fee > 0, PitError::InvalidParam);
        require!(
            (2..=MAX_SEATS as u8).contains(&max_players),
            PitError::InvalidParam
        );
        require!(
            (MIN_DURATION_SECS..=MAX_DURATION_SECS).contains(&duration_secs),
            PitError::InvalidParam
        );
        require!(rake_bps <= MAX_RAKE_BPS, PitError::InvalidParam);

        let rent = Rent::get()?.minimum_balance(0);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            rent,
        )?;

        // Pre-fund the arena with the rent of its EphemeralPermission. The permission is
        // created inside the ER and paid by this PDA, so the lamports have to travel with
        // the account when it gets delegated.
        let permission_rent = ephemeral_rollups_sdk::ephemeral_accounts::rent(
            EphemeralPermission::size_of(MAX_SEATS + 1) as u32,
        );
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.arena.to_account_info(),
                },
            ),
            permission_rent,
        )?;

        let arena = &mut ctx.accounts.arena;
        arena.creator = ctx.accounts.creator.key();
        arena.feed = feed;
        arena.entry_fee = entry_fee;
        arena.pot = 0;
        arena.start_at = 0;
        arena.end_at = 0;
        arena.duration = duration_secs;
        arena.rake_bps = rake_bps;
        arena.max_players = max_players;
        arena.player_count = 0;
        arena.winner_count = 0;
        arena.status = ArenaStatus::Open;
        arena.bump = ctx.bumps.arena;
        arena.vault_bump = ctx.bumps.vault;
        let mut nonce_bytes = [0u8; 32];
        nonce_bytes[..nonce.len()].copy_from_slice(nonce.as_bytes());
        arena.nonce = nonce_bytes;
        arena.nonce_len = nonce.len() as u8;
        arena.is_private = false;
        arena.shock_seat = NO_SHOCK;
        arena.series = Pubkey::default();
        arena.round_no = 0;
        arena.lst_winner = Pubkey::default();
        arena.lst_bonus = 0;
        arena.series_recorded = false;
        // init ya deja la cuenta en ceros: no hace falta materializar el array en el stack.

        emit!(ArenaOpened {
            arena: arena.key(),
            feed,
            entry_fee,
        });
        Ok(())
    }

    /// BASE. Open a series: rounds that keep a cumulative score on-chain.
    pub fn create_series(ctx: Context<CreateSeries>, nonce: String, max_rounds: u8) -> Result<()> {
        require!(!nonce.is_empty() && nonce.len() <= 32, PitError::InvalidParam);
        let max = if max_rounds == 0 {
            MAX_SERIES_ROUNDS
        } else {
            max_rounds
        };
        require!(max <= MAX_SERIES_ROUNDS, PitError::InvalidParam);

        let series = &mut ctx.accounts.series;
        series.creator = ctx.accounts.creator.key();
        series.bump = ctx.bumps.series;
        series.rounds = 0;
        series.max_rounds = max;
        series.entry_fee = 0;
        let bytes = nonce.as_bytes();
        series.nonce[..bytes.len()].copy_from_slice(bytes);
        series.nonce_len = bytes.len() as u8;
        series.standings = [Standing::default(); MAX_SEATS];

        emit!(SeriesOpened {
            series: series.key(),
            creator: series.creator,
            max_rounds: max,
        });
        Ok(())
    }

    /// BASE. Bind an open arena to a series. Permissionless: binding moves no funds and
    /// both accounts already record their creator, so the only rule is that they match.
    /// The round number follows the series calendar.
    pub fn bind_series(
        ctx: Context<BindSeries>,
        _nonce: String,
        series_key: Pubkey,
    ) -> Result<()> {
        let series = &ctx.accounts.series;
        require_keys_eq!(series.key(), series_key, PitError::InvalidParam);
        require!(series.rounds < series.max_rounds, PitError::SeriesComplete);

        let arena = &mut ctx.accounts.arena;
        require!(arena.status == ArenaStatus::Open, PitError::ArenaNotOpen);
        require!(arena.series == Pubkey::default(), PitError::InvalidParam);
        require_keys_eq!(arena.creator, series.creator, PitError::Unauthorized);

        arena.series = series.key();
        arena.round_no = series.rounds.saturating_add(1);
        Ok(())
    }

    /// BASE. Fold a closed arena into its series standings. Permissionless and idempotent:
    /// the arena remembers it was counted, so a replay cannot inflate the table.
    ///
    /// Points: podium 10/6/3 + 1 per bite survived while holding + 2 for the last one standing.
    pub fn record_round(ctx: Context<RecordRound>, _nonce: String, series_key: Pubkey) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.series.key(),
            series_key,
            PitError::InvalidParam
        );
        let arena = &ctx.accounts.arena;
        require!(arena.status == ArenaStatus::Closed, PitError::NotSettled);
        require_keys_eq!(arena.series, ctx.accounts.series.key(), PitError::InvalidParam);
        require!(!arena.series_recorded, PitError::RoundAlreadyRecorded);

        let series = &mut ctx.accounts.series;
        require!(series.rounds < series.max_rounds, PitError::SeriesComplete);

        let count = (arena.player_count as usize).min(MAX_SEATS);
        for i in 0..count {
            let seat = arena.seats[i];
            if seat.player == Pubkey::default() {
                continue;
            }

            let mut pts: u16 = (seat.streak as u16).saturating_mul(POINTS_PER_SURVIVED);
            let mut podium = false;
            for (rank, r) in arena.results.iter().enumerate() {
                if r.player == seat.player {
                    pts = pts.saturating_add(POINTS_PODIUM[rank]);
                    podium = true;
                }
            }
            if arena.lst_winner == seat.player {
                pts = pts.saturating_add(POINTS_LAST_STANDING);
            }

            series.award(
                seat.player,
                pts,
                seat.bites as u16,
                seat.streak as u16,
                podium,
            )?;
        }
        series.rounds = series.rounds.saturating_add(1);

        let round_no = arena.round_no;
        let arena = &mut ctx.accounts.arena;
        arena.series_recorded = true;

        emit!(SeriesRoundRecorded {
            series: ctx.accounts.series.key(),
            arena: arena.key(),
            round_no,
        });
        Ok(())
    }

    /// Take a seat. The entry fee goes to the vault on the base layer.
    pub fn join_arena(ctx: Context<JoinArena>, _nonce: String) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        require!(arena.status == ArenaStatus::Open, PitError::ArenaNotOpen);
        require!(
            (arena.player_count as usize) < (arena.max_players as usize).min(MAX_SEATS),
            PitError::ArenaFull
        );

        let who = ctx.accounts.player.key();
        require!(arena.seat_index(&who).is_none(), PitError::AlreadyJoined);

        let idx = arena.player_count as usize;
        arena.seats[idx] = Seat {
            player: who,
            bankroll: START_BANKROLL,
            realized: 0,
            notional: 0,
            entry_price: 0,
            trades: 0,
            side: 0,
            bites: 0,
            streak: 0,
            pressure: 0,
            mad_until: 0,
        };
        arena.player_count = arena.player_count.saturating_add(1);
        arena.pot = arena
            .pot
            .checked_add(arena.entry_fee)
            .ok_or(PitError::MathOverflow)?;

        let fee = arena.entry_fee;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            fee,
        )?;

        emit!(SeatTaken {
            arena: arena.key(),
            player: who,
            pot: arena.pot,
        });
        Ok(())
    }

    /// Close registration and start the clock. Still on the base layer: this must
    /// happen *before* the arena is delegated.
    pub fn lock_arena(ctx: Context<LockArena>, _nonce: String) -> Result<()> {
        msg!("bind: series checks ok");
        let arena = &mut ctx.accounts.arena;
        msg!("bind: arena loaded, status={:?}", arena.status);
        require_keys_eq!(
            arena.creator,
            ctx.accounts.creator.key(),
            PitError::Unauthorized
        );
        require!(arena.status == ArenaStatus::Open, PitError::ArenaNotOpen);
        require!(arena.player_count >= 2, PitError::NotEnoughPlayers);

        let now = Clock::get()?.unix_timestamp;
        arena.start_at = now;
        arena.end_at = now
            .checked_add(arena.duration)
            .ok_or(PitError::MathOverflow)?;
        arena.status = ArenaStatus::Live;
        arena.last_shock_ts = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// BASE LAYER. Delegate the arena to the ER so it can be traded on.
    pub fn delegate_arena(ctx: Context<DelegateArena>, nonce: String) -> Result<()> {
        validate_nonce(&nonce)?;
        ctx.accounts.delegate_arena(
            &ctx.accounts.payer,
            &[ARENA_SEED, nonce.as_bytes()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// ER. Open a long (side = 1) or short (side = -1) position priced by the oracle.
    pub fn open_position(
        ctx: Context<Trade>,
        _nonce: String,
        side: i8,
        leverage: u8,
    ) -> Result<()> {
        require!(side == 1 || side == -1, PitError::InvalidSide);
        require!(
            leverage >= 1 && leverage <= MAX_LEVERAGE,
            PitError::InvalidLeverage
        );

        let now = Clock::get()?.unix_timestamp;
        let price = read_price(&ctx.accounts.feed, &ctx.accounts.arena.feed, now)?;

        let arena = &mut ctx.accounts.arena;
        require!(arena.status == ArenaStatus::Live, PitError::ArenaNotLive);
        require!(arena.end_at > 0 && now < arena.end_at, PitError::RoundClosed);

        let trader = ctx.accounts.trader.key();
        let arena_key = arena.key();
        let idx = arena.seat_index(&trader).ok_or(PitError::NotASeat)?;
        let snapshot = arena.seats[idx];
        require!(snapshot.side == 0, PitError::PositionOpen);

        let equity = arena.equity_at(&snapshot, price)?.max(0) as u128;
        let notional_u128 = equity
            .checked_mul(leverage as u128)
            .ok_or(PitError::MathOverflow)?;
        require!(notional_u128 > 0, PitError::InvalidParam);
        require!(notional_u128 <= u64::MAX as u128, PitError::MathOverflow);

        let notional = notional_u128 as u64;

        // En fiebre, la orden sale invertida. El agente pidió una cosa y el pozo hizo otra.
        let mad = is_mad(&snapshot, now);
        let executed = if mad { -side } else { side };

        let seat = &mut arena.seats[idx];
        seat.side = executed;
        seat.notional = notional;
        seat.trades = seat.trades.saturating_add(1);
        seat.entry_price = price;

        emit!(PositionOpened {
            arena: arena_key,
            player: trader,
            side: executed,
            notional,
            entry_price: price,
        });
        if mad {
            emit!(MadTrade {
                arena: arena_key,
                seat: idx as u8,
                wanted: side,
                executed,
            });
        }
        Ok(())
    }

    /// ER. Close the open position and realise the PnL, capped at the bankroll.
    pub fn close_position(ctx: Context<Trade>, _nonce: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let price = read_price(&ctx.accounts.feed, &ctx.accounts.arena.feed, now)?;

        let arena = &mut ctx.accounts.arena;
        require!(arena.status == ArenaStatus::Live, PitError::ArenaNotLive);

        let trader = ctx.accounts.trader.key();
        let arena_key = arena.key();
        let idx = arena.seat_index(&trader).ok_or(PitError::NotASeat)?;
        let seat = &mut arena.seats[idx];
        require!(seat.side != 0, PitError::NoPosition);

        let pnl = position_pnl(seat.side, seat.notional, seat.entry_price, price)?;
        let realized = seat.realized as i128 + pnl;
        let floor = -(seat.bankroll as i128);
        seat.realized = realized.max(floor).min(i64::MAX as i128) as i64;

        seat.side = 0;
        seat.notional = 0;
        seat.entry_price = 0;
        seat.trades = seat.trades.saturating_add(1);

        // Perder desquicia, ganar despeja. El que se equivoca seguido termina en fiebre.
        if pnl <= -LOSS_THRESHOLD {
            add_pressure(seat, PRESSURE_LOSS, now);
        } else if pnl >= LOSS_THRESHOLD {
            seat.pressure = seat.pressure.saturating_sub(PRESSURE_WIN);
        }
        let mad_now = seat.pressure >= PRESSURE_MAX
            || (seat.mad_until > now && seat.pressure == PRESSURE_AFTER_MAD);
        if mad_now {
            emit!(Madness {
                arena: arena_key,
                seat: idx as u8,
                until: seat.mad_until,
                pressure: seat.pressure,
            });
        }

        emit!(PositionClosed {
            arena: arena_key,
            player: trader,
            pnl: pnl as i64,
            exit_price: price,
        });
        Ok(())
    }

    /// ER. Freeze the round and rank the seats by equity at the final price.
    pub fn end_round(ctx: Context<Trade>, _nonce: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let price = read_price(&ctx.accounts.feed, &ctx.accounts.arena.feed, now)?;

        let arena = &mut ctx.accounts.arena;
        require!(arena.status == ArenaStatus::Live, PitError::ArenaNotLive);
        require!(
            arena.end_at > 0 && now >= arena.end_at,
            PitError::RoundNotOver
        );

        let mut top: [(Pubkey, i128); 3] = [(Pubkey::default(), i128::MIN); 3];
        let count = (arena.player_count as usize).min(MAX_SEATS);
        for i in 0..count {
            let seat = arena.seats[i];
            if seat.player == Pubkey::default() {
                continue;
            }
            let equity = arena.equity_at(&seat, price)?;
            rank_insert(&mut top, (seat.player, equity));
        }

        let mut winners = 0u8;
        for i in 0..3 {
            if top[i].0 == Pubkey::default() {
                arena.results[i] = PitResult::default();
            } else {
                arena.results[i] = PitResult {
                    player: top[i].0,
                    equity: top[i].1.clamp(i64::MIN as i128, i64::MAX as i128) as i64,
                };
                winners = winners.saturating_add(1);
            }
        }
        require!(winners > 0, PitError::NotEnoughPlayers);

        // Bono "last one standing": si al campanazo queda exactamente una posición
        // abierta, se lleva una tajada del pozo antes del reparto del podio.
        let mut holding = 0u8;
        let mut holder = Pubkey::default();
        for i in 0..count {
            let seat = arena.seats[i];
            if seat.player != Pubkey::default() && seat.side != 0 {
                holding = holding.saturating_add(1);
                holder = seat.player;
            }
        }
        arena.lst_winner = if holding == 1 { holder } else { Pubkey::default() };

        arena.winner_count = winners;
        arena.status = ArenaStatus::Settled;
        Ok(())
    }

    /// ER. Commit the final arena state and hand ownership back to the base layer.
    pub fn commit_round(ctx: Context<CommitRound>, _nonce: String) -> Result<()> {
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.arena.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    /// ER. Create the ephemeral permission for the arena. Paid by the arena PDA itself
    /// (it signs with its own seeds), idempotent, and starts public — privacy is opt-in
    /// through `set_privacy`.
    pub fn init_permission(ctx: Context<InitPermissionCtx>, _nonce: String) -> Result<()> {
        if ctx.accounts.permission.lamports() > 0 {
            msg!("permission already exists, skipping");
            return Ok(());
        }
        let nonce = _nonce.clone();
        let signers: &[&[u8]] = &[ARENA_SEED, nonce.as_bytes(), &[ctx.bumps.arena]];
        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.arena.to_account_info(),
            permissioned_account: ctx.accounts.arena.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs {
                is_private: false,
                members: vec![],
            },
        }
        .invoke_signed(&[signers])?;
        Ok(())
    }

    /// ER. Flip the arena between sealed and public. The member list is rebuilt from
    /// scratch on every call — an update replaces it, it does not merge.
    ///
    /// Sealed = creator + every seated player can read the rollup state with their own
    /// token; everybody else is rejected at the TEE ingress. Public = no members.
    pub fn set_privacy(ctx: Context<PermissionCtx>, nonce: String, is_private: bool) -> Result<()> {
        let mut members: Vec<Member> = Vec::new();
        {
            let arena = &ctx.accounts.arena;
            if is_private {
                const FLAGS: u8 = TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG;
                members.push(Member {
                    flags: FLAGS,
                    pubkey: arena.creator,
                });
                for i in 0..(arena.player_count as usize).min(MAX_SEATS) {
                    let player = arena.seats[i].player;
                    if player != Pubkey::default() && !members.iter().any(|m| m.pubkey == player) {
                        members.push(Member {
                            flags: FLAGS,
                            pubkey: player,
                        });
                    }
                }
            }
        }

        let signers: &[&[u8]] = &[ARENA_SEED, nonce.as_bytes(), &[ctx.accounts.arena.bump]];
        UpdateEphemeralPermissionCpi {
            payer: ctx.accounts.arena.to_account_info(),
            permissioned_account: ctx.accounts.arena.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            authority: ctx.accounts.arena.to_account_info(),
            authority_is_signer: false,
            args: EphemeralMembersArgs {
                is_private,
                members,
            },
        }
        .invoke_signed(&[signers])?;

        // Mirror the policy on the arena so any client can read it from the account.
        ctx.accounts.arena.is_private = is_private;

        msg!("privacy set to {}", is_private);
        Ok(())
    }

    /// ER. Close the permission and return its rent to the arena PDA.
    pub fn close_permission(ctx: Context<InitPermissionCtx>, nonce: String) -> Result<()> {
        let signers: &[&[u8]] = &[ARENA_SEED, nonce.as_bytes(), &[ctx.bumps.arena]];
        CloseEphemeralPermissionCpi {
            payer: ctx.accounts.arena.to_account_info(),
            permissioned_account: ctx.accounts.arena.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            authority: ctx.accounts.arena.to_account_info(),
            authority_is_signer: false,
        }
        .invoke_signed(&[signers])?;
        Ok(())
    }

    /// ER. Ask the oracle to bite. Permissionless crank: anyone can call it, but the
    /// program enforces the cooldown, so nobody can spam the pit.
    pub fn request_shock(ctx: Context<RequestShockCtx>, _nonce: String) -> Result<()> {
        let arena = &ctx.accounts.arena;
        require!(arena.status == ArenaStatus::Live, PitError::ArenaNotLive);

        let now = Clock::get()?.unix_timestamp;
        let cooldown = shock_cooldown(arena.duration);
        require!(now >= arena.last_shock_ts + cooldown, PitError::ShockCooldown);
        // La última mordida tiene que caber antes del campanazo: así queda una ventana
        // final para aguantar la posición y pelear el bono.
        require!(now + cooldown <= arena.end_at, PitError::PitAsleep);

        let count = (arena.player_count as usize).min(MAX_SEATS);
        let open = arena.seats[..count].iter().filter(|s| s.side != 0).count();
        require!(open > 0, PitError::NoOpenPositions);

        // Seed is not caller-controlled: arena identity + clock + epoch.
        let mut caller_seed = [0u8; 32];
        caller_seed[..8].copy_from_slice(&arena.key().to_bytes()[..8]);
        caller_seed[8..16].copy_from_slice(&now.to_le_bytes());
        caller_seed[16] = arena.shock_count;

        let ix = create_request_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::ShockCallback::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: ctx.accounts.arena.key(),
                    is_signer: false,
                    is_writable: true,
                },
                SerializableAccountMeta {
                    pubkey: ctx.accounts.arena.feed,
                    is_signer: false,
                    is_writable: false,
                },
            ]),
            // El epoch viaja al callback: un callback viejo se descarta solo.
            callback_args: Some(vec![arena.shock_count]),
            ..Default::default()
        });

        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// ER. Oracle callback: force-close ONE random seat that is holding risk.
    ///
    /// Only seats with an open position are eligible, so being flat is a real defence.
    /// `epoch` must match the arena's shock counter; a replayed or out-of-order callback
    /// returns without touching state, so nobody gets bitten twice for the same request.
    pub fn shock_callback(
        ctx: Context<ShockCallbackCtx>,
        randomness: [u8; 32],
        epoch: u8,
    ) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        if epoch != arena.shock_count {
            msg!("stale shock: epoch {} vs {}", epoch, arena.shock_count);
            return Ok(());
        }
        require!(arena.status == ArenaStatus::Live, PitError::ArenaNotLive);

        let count = (arena.player_count as usize).min(MAX_SEATS);
        let mut open = [0u8; MAX_SEATS];
        let mut n = 0usize;
        for i in 0..count {
            if arena.seats[i].side != 0 {
                open[n] = i as u8;
                n += 1;
            }
        }
        require!(n > 0, PitError::NoOpenPositions);

        // Range semantics of the helper are not documented; clamp regardless.
        let pick =
            (vrf::rnd::random_u8_with_range(&randomness, 0, (n - 1) as u8) as usize).min(n - 1);
        let idx = open[pick] as usize;

        let feed = arena.feed;
        let now = Clock::get()?.unix_timestamp;
        let price = read_price(&ctx.accounts.feed, &feed, now)?;

        // Racha: los que estaban dentro y no fueron elegidos suman una sobrevivida;
        // el elegido reinicia la suya. Se calcula ANTES de cerrar la posición.
        for i in 0..count {
            if arena.seats[i].side == 0 {
                continue;
            }
            if i == idx {
                arena.seats[i].bites = arena.seats[i].bites.saturating_add(1);
                arena.seats[i].streak = 0;
                let went_mad = add_pressure(&mut arena.seats[i], PRESSURE_BITE, now);
                if went_mad {
                    emit!(Madness {
                        arena: arena.key(),
                        seat: i as u8,
                        until: arena.seats[i].mad_until,
                        pressure: arena.seats[i].pressure,
                    });
                }
            } else {
                arena.seats[i].streak = arena.seats[i].streak.saturating_add(1);
            }
        }

        let seat = &mut arena.seats[idx];
        let pnl = position_pnl(seat.side, seat.notional, seat.entry_price, price)?;
        let realized = seat.realized as i128 + pnl;
        let floor = -(seat.bankroll as i128);
        seat.realized = realized.max(floor).min(i64::MAX as i128) as i64;
        seat.side = 0;
        seat.notional = 0;
        seat.entry_price = 0;

        arena.shock_seat = idx as u8;
        arena.shock_count = arena.shock_count.saturating_add(1);
        arena.last_shock_ts = now;

        emit!(ShockApplied {
            arena: arena.key(),
            seat: idx as u8,
            price,
            count: arena.shock_count,
        });
        Ok(())
    }

    /// BASE LAYER. Pay the podium out of the escrow vault. Permissionless and
    /// idempotent: the first call flips the arena to `Closed`.
    ///
    /// The podium accounts must be passed as `remaining_accounts`, in podium order,
    /// because the vault signs a CPI system transfer to each one and a CPI can only
    /// touch accounts present in its account list.
    pub fn settle<'a>(ctx: Context<'a, Settle<'a>>, _nonce: String) -> Result<()> {
        require!(
            ctx.accounts.arena.status == ArenaStatus::Settled,
            PitError::NotSettled
        );

        let pot = ctx.accounts.arena.pot;
        require!(pot > 0, PitError::InvalidParam);

        let rake_bps = ctx.accounts.arena.rake_bps;
        let winner_count = ctx.accounts.arena.winner_count as usize;
        let results = ctx.accounts.arena.results;
        let arena_key = ctx.accounts.arena.key();
        let vault_bump = ctx.accounts.arena.vault_bump;
        let creator = ctx.accounts.arena.creator;

        let rake = ((pot as u128) * (rake_bps as u128) / 10_000) as u64;
        let lst_winner = ctx.accounts.arena.lst_winner;
        let lst_bonus = if lst_winner != Pubkey::default() {
            ((pot as u128) * (LST_BPS as u128) / 10_000) as u64
        } else {
            0
        };
        let net = pot.saturating_sub(rake).saturating_sub(lst_bonus);
        let winners = winner_count.min(3);
        let shares = SHARES[winners];
        require!(
            ctx.remaining_accounts.len() >= winners,
            PitError::InvalidParam
        );

        let vault_seeds: &[&[u8]] = &[VAULT_SEED, arena_key.as_ref(), &[vault_bump]];

        for i in 0..winners {
            let recipient = &ctx.remaining_accounts[i];
            require_keys_eq!(recipient.key(), results[i].player, PitError::InvalidParam);

            let amount = ((net as u128) * (shares[i] as u128) / 10_000) as u64;
            if amount == 0 {
                continue;
            }
            let ix = system_instruction::transfer(&ctx.accounts.vault.key(), recipient.key, amount);
            invoke_signed(
                &ix,
                &[
                    ctx.accounts.vault.to_account_info(),
                    recipient.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[vault_seeds],
            )?;
        }

        // El bono va después del podio: `remaining_accounts[winners]`.
        if lst_bonus > 0 {
            let recipient = ctx
                .remaining_accounts
                .get(winners)
                .ok_or(PitError::InvalidParam)?;
            require_keys_eq!(recipient.key(), lst_winner, PitError::InvalidParam);
            let ix = system_instruction::transfer(&ctx.accounts.vault.key(), recipient.key, lst_bonus);
            invoke_signed(
                &ix,
                &[
                    ctx.accounts.vault.to_account_info(),
                    recipient.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[vault_seeds],
            )?;
        }

        if rake > 0 {
            let ix = system_instruction::transfer(&ctx.accounts.vault.key(), &creator, rake);
            invoke_signed(
                &ix,
                &[
                    ctx.accounts.vault.to_account_info(),
                    ctx.accounts.creator.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[vault_seeds],
            )?;
        }

        let arena = &mut ctx.accounts.arena;
        arena.lst_bonus = lst_bonus;
        arena.status = ArenaStatus::Closed;

        emit!(RoundSettled {
            arena: arena_key,
            winner: results[0].player,
            pot,
            winner_count: winners as u8,
        });
        Ok(())
    }
}

/* ------------------------------- contexts ------------------------------- */

#[derive(Accounts)]
#[instruction(nonce: String, max_rounds: u8)]
pub struct CreateSeries<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = SERIES_SPACE,
        seeds = [SERIES_SEED, nonce.as_bytes()],
        bump
    )]
    pub series: Account<'info, Series>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: String, series_key: Pubkey)]
pub struct BindSeries<'info> {
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    #[account(constraint = series.key() == series_key)]
    pub series: Account<'info, Series>,
}

#[derive(Accounts)]
#[instruction(nonce: String, series_key: Pubkey)]
pub struct RecordRound<'info> {
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    #[account(mut, constraint = series.key() == series_key)]
    pub series: Account<'info, Series>,
}


#[derive(Accounts)]
#[instruction(nonce: String, entry_fee: u64, duration_secs: i64)]
pub struct CreateArena<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = ARENA_SPACE,
        seeds = [ARENA_SEED, nonce.as_bytes()],
        bump
    )]
    pub arena: Account<'info, Arena>,
    /// CHECK: escrow PDA, system owned, created by the transfer below
    #[account(mut, seeds = [VAULT_SEED, arena.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct JoinArena<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [ARENA_SEED, nonce.as_bytes()],
        bump
    )]
    pub arena: Box<Account<'info, Arena>>,
    /// CHECK: escrow vault
    #[account(mut, seeds = [VAULT_SEED, arena.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct LockArena<'info> {
    pub creator: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
}

/// BASE LAYER delegation context. `#[delegate]` injects buffer/record/metadata
/// and the delegation program, and generates `delegate_arena`.
#[delegate]
#[derive(Accounts)]
pub struct DelegateArena<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the arena PDA, delegated in place
    #[account(mut, del)]
    pub arena: AccountInfo<'info>,
}

/// Shared ER context for the ephemeral permission of an arena. The permission account
/// lives only inside the rollup and is paid for by the arena PDA.
#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct PermissionCtx<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    /// CHECK: permission PDA, validated by the permission program
    #[account(
        mut,
        seeds = [PERMISSION_SEED, arena.key().as_ref()],
        bump,
        seeds::program = PERMISSION_PROGRAM_ID
    )]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: Permission Program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: verified by the magic program
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Magic Program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

/// Contexto ligero: init/close del permiso solo necesitan la PDA y quién paga.
/// Cargar aquí la cuenta `Arena` completa revienta el frame de la instrucción.
#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct InitPermissionCtx<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: solo semilla y lamports; no se deserializa.
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump)]
    pub arena: UncheckedAccount<'info>,
    /// CHECK: permission PDA, validated by the permission program
    #[account(
        mut,
        seeds = [PERMISSION_SEED, arena.key().as_ref()],
        bump,
        seeds::program = PERMISSION_PROGRAM_ID
    )]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: Permission Program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: verified by the magic program
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Magic Program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

/// ER context for the VRF request. `#[vrf]` injects the oracle accounts and
/// `invoke_signed_vrf`.
#[vrf]
#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct RequestShockCtx<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    /// CHECK: Oracle queue. Must be the delegated one because this runs inside the rollup,
    /// and it has to be writable: the CPI appends the request to it.
    #[account(
        mut,
        constraint = oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_QUEUE
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

/// Oracle callback context. `#[vrf_callback]` injects the scoped identity check: without it
/// the callback would be spoofable by anyone.
#[vrf_callback]
#[derive(Accounts)]
pub struct ShockCallbackCtx<'info> {
    #[account(mut)]
    pub arena: Box<Account<'info, Arena>>,
    /// CHECK: the arena's price feed, address-checked inside `read_price`
    pub feed: UncheckedAccount<'info>,
}

/// Suma presión y, si se llena, prende la fiebre. Nada permanente: la fiebre caduca sola.
fn add_pressure(seat: &mut Seat, amount: u8, now: i64) -> bool {
    seat.pressure = seat.pressure.saturating_add(amount).min(PRESSURE_MAX);
    if seat.pressure >= PRESSURE_MAX {
        seat.mad_until = now + MAD_SECS;
        seat.pressure = PRESSURE_AFTER_MAD;
        return true;
    }
    false
}

/// Un asiento en fiebre ejecuta lo contrario de lo que pide. Ese es el castigo real:
/// no pierde el juicio, pierde el control de sus órdenes.
fn is_mad(seat: &Seat, now: i64) -> bool {
    seat.mad_until > 0 && now < seat.mad_until
}

/// How often the pit bites: a function of round length, with a floor so short rounds
/// still leave room to trade.
fn shock_cooldown(duration: i64) -> i64 {
    (duration / SHOCK_DIVISOR as i64).max(SHOCK_MIN_COOLDOWN_SECS)
}

/// Shared ER trading context: arena + oracle feed, both resident in the rollup.
/// `trader` is deliberately NOT writable: a base-layer wallet is not delegated, and the
/// ER rejects writable non-delegated accounts with `InvalidWritableAccount`.
#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct Trade<'info> {
    pub trader: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    /// CHECK: MagicBlock price feed, address-checked against arena.feed on read
    pub feed: UncheckedAccount<'info>,
}

/// ER commit + undelegate context. `#[commit]` injects magic_context/magic_program.
#[commit]
#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct CommitRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
}

/// BASE LAYER settlement context.
#[derive(Accounts)]
#[instruction(nonce: String)]
pub struct Settle<'info> {
    #[account(mut, seeds = [ARENA_SEED, nonce.as_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    /// CHECK: escrow vault, signed by PDA seeds
    #[account(mut, seeds = [VAULT_SEED, arena.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: receives the rake
    #[account(mut, address = arena.creator)]
    pub creator: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/* -------------------------------- helpers -------------------------------- */

fn validate_nonce(nonce: &str) -> Result<()> {
    require!(
        !nonce.is_empty() && nonce.len() <= 32,
        PitError::InvalidParam
    );
    Ok(())
}

fn rank_insert(top: &mut [(Pubkey, i128); 3], candidate: (Pubkey, i128)) {
    for i in 0..3 {
        if candidate.1 > top[i].1 {
            let mut j = 2;
            while j > i {
                top[j] = top[j - 1];
                j -= 1;
            }
            top[i] = candidate;
            return;
        }
    }
}
