/**
 * Format number to/from USDC storage format (6 decimals)
 * USDC uses 6 decimal places, so 1.00 USDC = 1000000 in storage
 */
export function formatNumber(value: number | string, toStorage?: boolean): string;

/**
 * Convert human-readable amount to USDC storage format (6-digit string)
 */
export function toStorageFormat(amount: number | string): string;

/**
 * Convert USDC storage format to human-readable amount
 */
export function fromStorageFormat(amount: string | number): string;

