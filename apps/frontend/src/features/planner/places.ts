/**
 * Popular destinations, lowercase, for highlighting place names that are typed without capitals.
 * Capitalised names outside this list are still caught by the capitalised-run rule in highlight.ts,
 * so this only needs the places people commonly type in lowercase.
 */
export const PLACES = [
  // Cities
  'amsterdam', 'athens', 'austin', 'bangkok', 'barcelona', 'beijing', 'berlin', 'bilbao', 'bologna', 'boston',
  'bruges', 'brussels', 'budapest', 'buenos aires', 'cairo', 'cape town', 'cartagena', 'chiang mai', 'chicago',
  'copenhagen', 'cusco', 'delhi', 'new delhi', 'dubai', 'dublin', 'dubrovnik', 'edinburgh', 'florence', 'hanoi',
  'havana', 'helsinki', 'ho chi minh city', 'hong kong', 'honolulu', 'istanbul', 'jaipur', 'jerusalem', 'kyoto',
  'lima', 'lisbon', 'london', 'los angeles', 'madrid', 'marrakech', 'marrakesh', 'melbourne', 'mexico city', 'miami',
  'milan', 'montreal', 'moscow', 'mumbai', 'munich', 'nairobi', 'naples', 'nashville', 'new orleans', 'new york',
  'new york city', 'nyc', 'nice', 'osaka', 'oslo', 'paris', 'porto', 'prague', 'quebec city', 'reykjavik', 'rio',
  'rio de janeiro', 'rome', 'salzburg', 'san francisco', 'san sebastian', 'santiago', 'seattle', 'seoul', 'seville',
  'shanghai', 'singapore', 'stockholm', 'sydney', 'taipei', 'tallinn', 'tbilisi', 'tokyo', 'toronto', 'tulum',
  'valencia', 'vancouver', 'venice', 'vienna', 'warsaw', 'zurich', 'goa', 'kolkata', 'bengaluru', 'bangalore',
  'hyderabad', 'chennai', 'udaipur', 'varanasi', 'rishikesh', 'darjeeling', 'kathmandu', 'colombo', 'kuala lumpur',
  'manila', 'jakarta', 'auckland', 'queenstown', 'nara', 'hiroshima', 'hakone', 'busan', 'krakow', 'kraków',
  'granada', 'cordoba', 'córdoba', 'siena', 'verona', 'lyon', 'bordeaux', 'marseille', 'edinburgh', 'glasgow',
  'oaxaca', 'medellin', 'medellín', 'banff', 'zanzibar', 'petra', 'luang prabang', 'siem reap', 'hoi an', 'ubud',
  // Countries
  'argentina', 'australia', 'austria', 'belgium', 'bhutan', 'brazil', 'cambodia', 'canada', 'chile', 'china',
  'colombia', 'costa rica', 'croatia', 'cuba', 'czechia', 'denmark', 'egypt', 'england', 'finland', 'france',
  'germany', 'greece', 'iceland', 'india', 'indonesia', 'ireland', 'israel', 'italy', 'japan', 'jordan', 'kenya',
  'korea', 'south korea', 'laos', 'malaysia', 'maldives', 'mexico', 'mongolia', 'morocco', 'nepal', 'netherlands',
  'new zealand', 'norway', 'peru', 'philippines', 'poland', 'portugal', 'scotland', 'singapore', 'slovenia',
  'south africa', 'spain', 'sri lanka', 'sweden', 'switzerland', 'taiwan', 'tanzania', 'thailand', 'turkey',
  'türkiye', 'uae', 'uk', 'usa', 'vietnam', 'wales',
  // Regions, islands and landmarks
  'alps', 'amalfi coast', 'andalusia', 'bali', 'bavaria', 'big sur', 'cinque terre', 'cotswolds', 'crete',
  'dolomites', 'galapagos', 'highlands', 'hokkaido', 'kerala', 'ladakh', 'lake como', 'lapland', 'mallorca',
  'okinawa', 'patagonia', 'provence', 'puglia', 'rajasthan', 'santorini', 'sardinia', 'sicily', 'swiss alps',
  'tuscany', 'yucatan', 'yucatán', 'machu picchu', 'grand canyon', 'yosemite', 'banff national park', 'sahara',
  'serengeti', 'angkor wat', 'great barrier reef', 'mount fuji', 'fuji', 'himalayas', 'hawaii', 'maui', 'kauai',
  'sintra', 'algarve', 'normandy', 'champagne', 'loire valley', 'scottish highlands', 'isle of skye', 'phuket',
  'koh samui', 'langkawi', 'lombok', 'mykonos', 'capri', 'madeira', 'azores', 'tenerife', 'ibiza', 'corsica',
] as const;
