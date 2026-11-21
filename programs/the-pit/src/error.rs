use anchor_lang::prelude::*;

#[error_code]
pub enum PitError {
    #[msg("Invalid parameter")]
    InvalidParam,
    #[msg("Arena is not open")]
    ArenaNotOpen,
    #[msg("Arena is not live")]
    ArenaNotLive,
    #[msg("Arena is full")]
    ArenaFull,
    #[msg("Player already joined this arena")]
    AlreadyJoined,
    #[msg("Not enough players to start")]
    NotEnoughPlayers,
    #[msg("Signer is not a seat in this arena")]
    NotASeat,
    #[msg("Signer is not the arena creator")]
    Unauthorized,
    #[msg("A position is already open")]
    PositionOpen,
    #[msg("No position is open")]
    NoPosition,
    #[msg("Invalid side, expected 1 or -1")]
    InvalidSide,
    #[msg("Invalid leverage")]
    InvalidLeverage,
    #[msg("Round is not over yet")]
    RoundNotOver,
    #[msg("Round is closed for trading")]
    RoundClosed,
    #[msg("Arena is not settled")]
    NotSettled,
    #[msg("Arena is already settled")]
    AlreadySettled,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Wrong price feed account")]
    WrongFeed,
    #[msg("Malformed price feed account")]
    BadFeedData,
    #[msg("Invalid or stale price")]
    StalePrice,
    #[msg("Price value out of domain")]
    BadPrice,
    #[msg("A shock was already applied to this arena")]
    ShockAlreadyApplied,
    #[msg("The pit needs to breathe: shock cooldown not elapsed")]
    ShockCooldown,
    #[msg("Nobody is holding risk: no open positions to bite")]
    NoOpenPositions,
    #[msg("The pit sleeps before the bell: no bite fits before the round ends")]
    PitAsleep,
    #[msg("This series already played all its rounds")]
    SeriesComplete,
    #[msg("This round was already recorded in the series")]
    RoundAlreadyRecorded,
}
