/**
 * Format number to/from USDC storage format (6 decimals)
 * USDC uses 6 decimal places, so 1.00 USDC = 1000000 in storage
 * 
 * @param {number|string} value - The value to format
 * @param {boolean} toStorage - If true, converts from human-readable to storage format. If false, converts from storage to human-readable
 * @returns {string} - Formatted value as string
 * 
 * @example
 * formatNumber(1.00, true) // "1000000" (1.00 USDC in storage format)
 * formatNumber("1000000", false) // "1.00" (human-readable format)
 */
export function formatNumber(value, toStorage = false) {
  if (value === null || value === undefined) {
    throw new Error('Value cannot be null or undefined');
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    throw new Error('Value must be a valid number');
  }

  if (toStorage) {
    // Convert from human-readable to storage format (multiply by 1,000,000)
    const storageValue = Math.floor(numValue * 1000000);
    return storageValue.toString();
  } else {
    // Convert from storage format to human-readable (divide by 1,000,000)
    const humanValue = numValue / 1000000;
    return humanValue.toFixed(2);
  }
}

/**
 * Convert human-readable amount to USDC storage format (6-digit string)
 * @param {number|string} amount - Human-readable amount (e.g., 1.00)
 * @returns {string} - Storage format (e.g., "1000000")
 */
export function toStorageFormat(amount) {
  return formatNumber(amount, true);
}

/**
 * Convert USDC storage format to human-readable amount
 * @param {string|number} amount - Storage format amount (e.g., "1000000")
 * @returns {string} - Human-readable format (e.g., "1.00")
 */
export function fromStorageFormat(amount) {
  return formatNumber(amount, false);
}

