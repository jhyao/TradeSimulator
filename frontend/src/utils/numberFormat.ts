// Utility functions for consistent number formatting throughout the application

/**
 * Formats a number with two decimal places and comma separators
 * @param value The number to format
 * @param minimumFractionDigits Minimum decimal places (default: 2)
 * @param maximumFractionDigits Maximum decimal places (default: 2)
 * @returns Formatted string with commas and decimal places
 */
export const formatNumber = (
  value: number | null | undefined, 
  minimumFractionDigits: number = 2,
  maximumFractionDigits: number = 2
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00';
  }
  
  return value.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits
  });
};

/**
 * Formats a currency value with $ symbol, two decimal places and comma separators
 * @param value The number to format as currency
 * @returns Formatted string like "$1,234.56"
 */
export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '$0.00';
  }
  
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Formats a percentage value with two decimal places
 * @param value The number to format as percentage (e.g., 0.1234 becomes "12.34%")
 * @returns Formatted percentage string
 */
export const formatPercentage = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00%';
  }
  
  return `${formatNumber(value)}%`;
};

/**
 * Formats a price value with appropriate decimal places for trading
 * @param value The price to format
 * @param symbol The trading symbol (for symbol-specific formatting)
 * @returns Formatted price string
 */
export const formatPrice = (value: number | null | undefined, symbol?: string): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00';
  }
  
  // For most crypto pairs, use 2 decimal places
  // Could be extended to handle different precision based on symbol
  return formatNumber(value, 2, 2);
};

/**
 * Formats quantity/volume values
 * @param value The quantity to format
 * @returns Formatted quantity string
 */
export const formatQuantity = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00';
  }
  
  return formatNumber(value);
};