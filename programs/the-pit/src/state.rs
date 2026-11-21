use anchor_lang::prelude::*;

use crate::constants::{
    EXPONENT_OFFSET, FIXED, MAX_SEATS, MAX_PRICE_AGE_SECS, MIN_FEED_LEN, PRICE_OFFSET,
    PUBLISH_TIME_OFFSET,
};
use crate::error::PitError;

/// One seat in the arena. `bankroll` and `realized` are fixed-point (1e9 == 1.0).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct Seat {
    pub player: Pubkey,
    pub bankroll: u64,
    pub realized: i64,
    pub notional: u64,
    pub entry_price: u64,
    pub trades: u16,
    /// 0 = flat, 1 = long, -1 = short
    pub side: i8,
    /// Cuántas veces el pozo te sacó de una posición.
    pub bites: u8,
    /// Mordidas seguidas que sobreviviste estando dentro del mercado.
    pub streak: u8,
    /// Presión acumulada (0..=100). Al llenarse, el asiento entra en fiebre.
    pub pressure: u8,
    /// Unix ts hasta el que el asiento está en fiebre. 0 = cuerdo.
    pub mad_until: i64,
}

impl Default for Seat {
    fn default() -> Self {
        Self {
            player: Pubkey::default(),
            bankroll: 0,
            realized: 0,
            notional: 0,
            entry_price: 0,
            trades: 0,
            side: 0,
            bites: 0,
            streak: 0,
            pressure: 0,
            mad_until: 0,
        }
    }
}

/// Snapshot of a podium place, written on the ER and read after undelegation.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct PitResult {
    pub player: Pubkey,
    pub equity: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum ArenaStatus {
    #[default]
    Open,
    Live,
    Settled,
    Closed,
}

#[account]
pub struct Arena {
    pub creator: Pubkey,
    pub feed: Pubkey,
    pub entry_fee: u64,
    pub pot: u64,
    pub start_at: i64,
    pub end_at: i64,
    pub duration: i64,
    pub rake_bps: u16,
    pub max_players: u8,
    pub player_count: u8,
    pub winner_count: u8,
    pub status: ArenaStatus,
    pub bump: u8,
    pub vault_bump: u8,
    /// Raw bytes of the PDA nonce, plus its length. Stored so any client can rebuild the
    /// arena seeds without keeping an off-chain registry. Zero-padded.
    pub nonce: [u8; 32],
    pub nonce_len: u8,
    /// True while the ephemeral permission seals this arena. Mirrors the permission
    /// account so clients can read the policy without the (devnet-404) status endpoint.
    pub is_private: bool,
    /// Last seat the pit bit, or `NO_SHOCK`.
    pub shock_seat: u8,
    /// How many shocks have landed this round. Also the epoch used to reject stale callbacks.
    pub shock_count: u8,
    /// Unix ts of the last shock, for the cooldown.
    pub last_shock_ts: i64,
    /// Serie a la que pertenece la ronda, o `Pubkey::default()` si es partida suelta.
    pub series: Pubkey,
    /// Número de ronda dentro de la serie (1..3).
    pub round_no: u8,
    /// Quien se quedó como única posición abierta al campanazo.
    pub lst_winner: Pubkey,
    /// Bono pagado por eso, en lamports. Se calcula en `settle`.
    pub lst_bonus: u64,
    /// Evita que una ronda se cuente dos veces en la serie.
    pub series_recorded: bool,
    pub seats: [Seat; MAX_SEATS],
    pub results: [PitResult; 3],
}

impl Arena {
    /// The nonce as a UTF-8 string, for rebuilding the PDA seeds client-side.
    pub fn nonce_str(&self) -> Result<String> {
        String::from_utf8(self.nonce[..self.nonce_len as usize].to_vec())
            .map_err(|_| error!(PitError::InvalidParam))
    }

    pub fn seat_index(&self, who: &Pubkey) -> Option<usize> {
        let n = self.player_count as usize;
        for i in 0..n.min(MAX_SEATS) {
            if self.seats[i].player == *who {
                return Some(i);
            }
        }
        None
    }

    /// Equity: bankroll + realized pnl + unrealized pnl at `price`, floored at zero.
    pub fn equity_at(&self, seat: &Seat, price: u64) -> Result<i128> {
        let mut equity = seat.bankroll as i128 + seat.realized as i128;
        if seat.side != 0 && seat.entry_price > 0 {
            equity += position_pnl(seat.side, seat.notional, seat.entry_price, price)?;
        }
        Ok(equity.max(0))
    }
}

/// PnL of an open position, fixed-point, signed by side.
pub fn position_pnl(side: i8, notional: u64, entry: u64, now: u64) -> Result<i128> {
    require!(entry > 0, PitError::BadPrice);
    let diff = now as i128 - entry as i128;
    let raw = (notional as i128)
        .checked_mul(diff)
        .ok_or(PitError::MathOverflow)?
        / entry as i128;
    Ok(if side > 0 { raw } else { -raw })
}

/// Read and validate a MagicBlock price feed account.
///
/// Identity is enforced by address (`expected` is the feed recorded in the arena),
/// freshness by the upstream publish timestamp. The exponent is normalised to 1e9
/// regardless of its sign, because the on-chain field carries the magnitude of
/// decimals while the published feed list carries the signed exponent.
pub fn read_price(feed: &AccountInfo, expected: &Pubkey, now: i64) -> Result<u64> {
    require_keys_eq!(feed.key(), *expected, PitError::WrongFeed);

    let data = feed.try_borrow_data()?;
    require!(data.len() >= MIN_FEED_LEN, PitError::BadFeedData);

    let raw = i64::from_le_bytes(
        data[PRICE_OFFSET..PRICE_OFFSET + 8]
            .try_into()
            .map_err(|_| PitError::BadFeedData)?,
    );
    let exponent = i32::from_le_bytes(
        data[EXPONENT_OFFSET..EXPONENT_OFFSET + 4]
            .try_into()
            .map_err(|_| PitError::BadFeedData)?,
    );
    let publish_time = i64::from_le_bytes(
        data[PUBLISH_TIME_OFFSET..PUBLISH_TIME_OFFSET + 8]
            .try_into()
            .map_err(|_| PitError::BadFeedData)?,
    );

    require!(raw > 0, PitError::BadPrice);
    require!(publish_time > 0, PitError::StalePrice);
    require!(
        now.saturating_sub(publish_time) <= MAX_PRICE_AGE_SECS,
        PitError::StalePrice
    );

    normalize(raw, exponent)
}

fn pow10(n: u32) -> i128 {
    let mut out: i128 = 1;
    let mut i = 0;
    while i < n {
        out *= 10;
        i += 1;
    }
    out
}

/// Scale a raw integer price to 1e9 fixed point.
fn normalize(raw: i64, exponent: i32) -> Result<u64> {
    let mag = exponent.unsigned_abs();
    let v = raw as i128;
    let scaled = if mag <= 9 {
        v.checked_mul(pow10(9 - mag))
            .ok_or(PitError::MathOverflow)?
    } else {
        v / pow10(mag - 9)
    };
    require!(scaled > 0 && scaled <= u64::MAX as i128, PitError::BadPrice);
    debug_assert_eq!(FIXED, 1_000_000_000);
    Ok(scaled as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_sol_price_with_negative_exponent() {
        // 74.13526414 USD with -8 exponent
        assert_eq!(normalize(7_413_526_414, -8).unwrap(), 74_135_264_140);
    }

    #[test]
    fn normalizes_sol_price_with_magnitude_exponent() {
        // same value, exponent stored as magnitude (what the live account carries)
        assert_eq!(normalize(7_413_526_414, 8).unwrap(), 74_135_264_140);
    }

    #[test]
    fn rejects_non_positive_price() {
        assert!(normalize(0, -8).is_err());
        assert!(normalize(-1, -8).is_err());
    }

    #[test]
    fn pnl_is_symmetric() {
        let long = position_pnl(1, 1_000_000_000, 100_000_000_000, 110_000_000_000).unwrap();
        let short = position_pnl(-1, 1_000_000_000, 100_000_000_000, 110_000_000_000).unwrap();
        assert_eq!(long, 100_000_000);
        assert_eq!(short, -100_000_000);
    }
}

/// Una fila de la tabla de una serie.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct Standing {
    pub player: Pubkey,
    pub points: u16,
    pub rounds: u8,
    pub podiums: u8,
    pub bites: u16,
    pub survived: u16,
}

/// Tres rondas encadenadas. Los puntos viven on-chain, no en el cliente.
#[account]
pub struct Series {
    pub creator: Pubkey,
    pub bump: u8,
    pub rounds: u8,
    pub max_rounds: u8,
    pub entry_fee: u64,
    pub nonce: [u8; 32],
    pub nonce_len: u8,
    pub standings: [Standing; MAX_SEATS],
}

impl Series {
    pub fn nonce_str(&self) -> Result<String> {
        String::from_utf8(self.nonce[..self.nonce_len as usize].to_vec())
            .map_err(|_| error!(PitError::InvalidParam))
    }

    /// Suma puntos a un jugador; lo registra si es la primera vez.
    pub fn award(
        &mut self,
        player: Pubkey,
        points: u16,
        bites: u16,
        survived: u16,
        podium: bool,
    ) -> Result<()> {
        for i in 0..MAX_SEATS {
            if self.standings[i].player == player {
                let row = &mut self.standings[i];
                row.points = row.points.saturating_add(points);
                row.rounds = row.rounds.saturating_add(1);
                row.bites = row.bites.saturating_add(bites);
                row.survived = row.survived.saturating_add(survived);
                if podium {
                    row.podiums = row.podiums.saturating_add(1);
                }
                return Ok(());
            }
        }
        for i in 0..MAX_SEATS {
            if self.standings[i].player == Pubkey::default() {
                self.standings[i] = Standing {
                    player,
                    points,
                    rounds: 1,
                    podiums: if podium { 1 } else { 0 },
                    bites,
                    survived,
                };
                return Ok(());
            }
        }
        err!(PitError::ArenaFull)
    }
}
