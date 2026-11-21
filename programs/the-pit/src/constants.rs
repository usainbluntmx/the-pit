use anchor_lang::prelude::*;

/// Seed prefixes
pub const ARENA_SEED: &[u8] = b"arena";
pub const SERIES_SEED: &[u8] = b"series";
pub const VAULT_SEED: &[u8] = b"vault";

/// Fixed-point scale for prices, notional and pnl. 1e9 == 1.0
pub const FIXED: u64 = 1_000_000_000;

/// Virtual bankroll every seat starts with (1,000.000000000 credits)
pub const START_BANKROLL: u64 = 1_000 * FIXED;

/// Hard cap of seats per arena
pub const MAX_SEATS: usize = 8;

/// Leverage is 1..=MAX_LEVERAGE
pub const MAX_LEVERAGE: u8 = 5;

/// Hard bounds for arena parameters
pub const MIN_DURATION_SECS: i64 = 60;
pub const MAX_DURATION_SECS: i64 = 7 * 24 * 60 * 60;
pub const MAX_RAKE_BPS: u16 = 1_000;

/// Maximum accepted age of an oracle update, in seconds.
pub const MAX_PRICE_AGE_SECS: i64 = 120;

/// Borsh space reserved for an Arena account (incl. discriminator).
pub const ARENA_SPACE: usize = 982;

/// Sentinel for "no shock applied yet" in `Arena::shock_seat`.
pub const NO_SHOCK: u8 = u8::MAX;

/// The pit bites every `duration / SHOCK_DIVISOR` seconds, never faster than the floor.
/// A 240s round bites every 30s; a 60s round every 15s.
pub const SHOCK_DIVISOR: u32 = 8;
pub const SHOCK_MIN_COOLDOWN_SECS: i64 = 15;

/// Oracle price feed account layout (PriceUpdateV3, Borsh):
///   0..8    discriminator
///   8..40   write_authority
///   40..41  verification_level
///   41..73  price_message.feed_id
///   73..81  price_message.price        (i64 LE)
///   81..89  price_message.conf         (u64 LE)
///   89..93  price_message.exponent     (i32 LE, magnitude of decimals)
///   93..101 price_message.publish_time (i64 LE, unix seconds)
pub const PRICE_OFFSET: usize = 73;
pub const EXPONENT_OFFSET: usize = 89;
pub const PUBLISH_TIME_OFFSET: usize = 93;
pub const MIN_FEED_LEN: usize = 101;

/// Prize split by number of winners, in basis points of the net pot.
pub const SHARES: [[u16; 3]; 4] = [
    [0, 0, 0],
    [10_000, 0, 0],
    [6_500, 3_500, 0],
    [6_000, 2_500, 1_500],
];

/* -------------------------------- solo mode ------------------------------- */

/// The house PDA is the counterparty of a solo run: it pays the upside and
/// collects the entry when the player ends below the starting bankroll.
pub const HOUSE_SEED: &[u8] = b"house";

/// Hard cap for a solo payout: 3× the entry. Keeps the house from draining on
/// a single outlier round and makes the risk easy to explain.
pub const SOLO_CAP_BPS: u16 = 30_000;

/// Multiplier (in bps of the entry) for a final equity in `FIXED` units.
/// `< 1000` loses the entry, `1000..1049` returns it, then 1.25×, 1.5×, 2×, 3×.
pub fn solo_multiplier_bps(equity: i64) -> u16 {
    let e = equity as i128;
    let k = FIXED as i128;
    if e < 1_000 * k {
        0
    } else if e < 1_050 * k {
        10_000
    } else if e < 1_100 * k {
        12_500
    } else if e < 1_200 * k {
        15_000
    } else if e < 1_300 * k {
        20_000
    } else {
        SOLO_CAP_BPS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_tiers() {
        let k = FIXED as i64;
        assert_eq!(solo_multiplier_bps(999 * k), 0);
        assert_eq!(solo_multiplier_bps(1_000 * k), 10_000);
        assert_eq!(solo_multiplier_bps(1_049 * k), 10_000);
        assert_eq!(solo_multiplier_bps(1_050 * k), 12_500);
        assert_eq!(solo_multiplier_bps(1_099 * k), 12_500);
        assert_eq!(solo_multiplier_bps(1_100 * k), 15_000);
        assert_eq!(solo_multiplier_bps(1_199 * k), 15_000);
        assert_eq!(solo_multiplier_bps(1_200 * k), 20_000);
        assert_eq!(solo_multiplier_bps(1_299 * k), 20_000);
        assert_eq!(solo_multiplier_bps(1_300 * k), 30_000);
        assert_eq!(solo_multiplier_bps(5_000 * k), 30_000);
    }
}

/* ------------------------------- series ---------------------------------- */

/// Una serie son 3 rondas encadenadas con puntos acumulados.
pub const MAX_SERIES_ROUNDS: u8 = 3;

/// Puntos por puesto en cada ronda.
pub const POINTS_PODIUM: [u16; 3] = [10, 6, 3];
/// Puntos por cada mordida que sobreviviste estando dentro del mercado.
pub const POINTS_PER_SURVIVED: u16 = 1;
/// Bonus por quedarte como única posición abierta al campanazo.
pub const POINTS_LAST_STANDING: u16 = 2;

/// El bono "last one standing" sale del pozo, antes del reparto del podio.
pub const LST_BPS: u64 = 1_000; // 10 %

/// 8 (disc) + 32 + 1 + 1 + 1 + 8 + 32 + 1 + 16 * 40
pub const SERIES_SPACE: usize = 724;
/// 32 + 2 + 1 + 1 + 2 + 2
pub const STANDING_SIZE: usize = 40;

/* ------------------------------- fiebre ----------------------------------- */

/// Presión máxima antes de que el asiento pierda el control.
pub const PRESSURE_MAX: u8 = 100;
/// Lo que deja el pozo al morder.
pub const PRESSURE_BITE: u8 = 40;
/// Cerrar en pérdida (más de 20 créditos) desquicia; cerrar en verde despeja.
pub const PRESSURE_LOSS: u8 = 25;
pub const PRESSURE_WIN: u8 = 30;
pub const LOSS_THRESHOLD: i128 = 20_000_000_000; // 20 créditos en 1e9
/// Segundos que dura la fiebre y con cuánta presión se sale de ella.
pub const MAD_SECS: i64 = 20;
pub const PRESSURE_AFTER_MAD: u8 = 40;
