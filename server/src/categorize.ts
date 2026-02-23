// Auto-categorization rules for transactions without categories

const rules: [RegExp, string][] = [
  // Housing
  [/\b(rent|mortgage|hoa|property\s*mgmt|apt|leasing)\b/i, 'Rent/Mortgage'],
  // Groceries
  [/\b(kroger|walmart|whole\s*foods|trader\s*joe|safeway|aldi|costco|publix|target|wegmans|heb|meijer|sprouts|grocery|groceries)\b/i, 'Groceries'],
  // Gas/Auto
  [/\b(shell|chevron|exxon|mobil|bp\b|marathon|speedway|wawa|circle\s*k|gas|fuel|sunoco|valero|citgo|auto\s*parts|autozone|jiffy\s*lube|car\s*wash)\b/i, 'Gas & Auto'],
  // Restaurants/Dining
  [/\b(mcdonald|burger\s*king|wendy|starbucks|chipotle|chick-fil-a|taco\s*bell|subway|panera|dunkin|domino|pizza\s*hut|panda\s*express|grubhub|doordash|uber\s*eats|postmates|restaurant|dining|cafe|diner|bistro|grill|sushi|thai|chinese|mexican|indian|italian)\b/i, 'Dining'],
  // Subscriptions
  [/\b(netflix|spotify|hulu|disney\+?|apple\s*(music|tv|one)|youtube|amazon\s*prime|hbo|paramount|peacock|audible|dropbox|icloud|google\s*(storage|one)|adobe|microsoft\s*365)\b/i, 'Subscriptions'],
  // Utilities
  [/\b(electric|gas\s*co|water\s*(bill|utility)|sewer|power|energy|utility|utilities|comcast|xfinity|att\b|at&t|verizon|t-mobile|tmobile|spectrum|internet|cable|phone\s*bill)\b/i, 'Utilities'],
  // Transfers
  [/\b(transfer|zelle|venmo|paypal|cash\s*app|wire|ach)\b/i, 'Transfers'],
  // Income patterns
  [/\b(payroll|direct\s*dep|salary|wage|irs|tax\s*refund|interest\s*payment)\b/i, 'Income'],
  // Insurance
  [/\b(insurance|geico|progressive|state\s*farm|allstate|usaa|liberty\s*mutual)\b/i, 'Insurance'],
  // Health
  [/\b(pharmacy|cvs|walgreens|doctor|hospital|medical|dental|health|urgent\s*care|labcorp|quest\s*diag)\b/i, 'Health & Medical'],
  // Shopping
  [/\b(amazon(?!\s*prime)|ebay|etsy|best\s*buy|home\s*depot|lowes|ikea|nordstrom|macys|kohls|tjmaxx|marshalls|ross)\b/i, 'Shopping'],
  // Travel
  [/\b(airline|flight|hotel|airbnb|vrbo|booking\.com|expedia|hertz|enterprise|uber(?!\s*eats)|lyft|parking|toll)\b/i, 'Travel & Transport'],
  // Fitness
  [/\b(gym|fitness|planet\s*fitness|la\s*fitness|equinox|peloton|crossfit|yoga)\b/i, 'Fitness'],
  // Education
  [/\b(tuition|university|college|school|student\s*loan|coursera|udemy)\b/i, 'Education'],
  // Entertainment
  [/\b(movie|cinema|theater|concert|ticketmaster|amc|regal|steam|playstation|xbox|nintendo)\b/i, 'Entertainment'],
]

export function categorize(description: string): string {
  for (const [pattern, category] of rules) {
    if (pattern.test(description)) return category
  }
  return 'Uncategorized'
}
