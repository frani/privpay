/**
 * Format number to/from USDC storage format (6 decimals)
 * USDC uses 6 decimal places, so 1.00 USDC = 1000000 in storage
 * 
 * @param value - The value to format
 * @param toStorage - If true, converts from human-readable to storage format. If false, converts from storage to human-readable
 * @returns Formatted value as string
 * 
 * @example
 * formatNumber(1.00, true) // "1000000" (1.00 USDC in storage format)
 * formatNumber("1000000", false) // "1.00" (human-readable format)
 */
export function formatNumber(value: number | string, toStorage?: boolean): string

/**
 * Convert human-readable amount to USDC storage format (6-digit string)
 * @param amount - Human-readable amount (e.g., 1.00)
 * @returns Storage format (e.g., "1000000")
 */
export function toStorageFormat(amount: number | string): string

/**
 * Convert USDC storage format to human-readable amount
 * @param amount - Storage format amount (e.g., "1000000")
 * @returns Human-readable format (e.g., "1.00")
 */
export function fromStorageFormat(amount: string | number): string

