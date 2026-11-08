import type { Itinerary, TripRequest } from './schema';

/**
 * A hand-written itinerary. It is shown only when the traveller explicitly asks for the
 * sample, and it is labelled as such — it is never used as a fallback for a failed request.
 * The failure lab also streams it back to simulate a model.
 */

export const SAMPLE_REQUEST: TripRequest = {
  brief:
    'Three unhurried days in Lisbon in late spring. I love tiled facades, viewpoints, seafood and old trams. Not a big museum person, happy to walk a lot but want slow evenings.',
  days: 3,
  pace: 'balanced',
};

export const SAMPLE_ITINERARY: Itinerary = {
  title: 'Three slow days in Lisbon',
  destination: 'Lisbon, Portugal',
  summary:
    'Hilltop viewpoints, tiled lanes and long seafood dinners, with one day out to the palaces of Sintra. Mornings are for walking, evenings are for lingering.',
  notes: [
    'A Viva Viagem card covers trams, metro and the Sintra train; load it with Zapping credit.',
    'Tram 28 is busiest from 10:00 to 17:00. Ride it early or walk the route instead.',
    'Pena Palace uses timed entry. Book the first slot online a few days ahead.',
    'Wear shoes with grip: the limestone calçada is slippery, even when dry.',
  ],
  days: [
    {
      id: 'sample-d1',
      title: 'Alfama and the river',
      summary: 'The oldest quarter on foot, from castle walls down to the waterfront.',
      stops: [
        { id: 'sample-s1', time: '08:30', title: 'Tram 28 from Martim Moniz', description: 'Catch the yellow tram at its first stop before the queues form and ride it up into Graça.', category: 'transit', durationMinutes: 25, area: 'Martim Moniz', tip: 'Sit on the right-hand side for the best views of the descent.' },
        { id: 'sample-s2', time: '09:15', title: 'Miradouro da Senhora do Monte', description: 'The highest viewpoint in the city, quiet in the morning, with the castle and river laid out below.', category: 'sight', durationMinutes: 30, area: 'Graça', tip: null },
        { id: 'sample-s3', time: '10:00', title: 'Castelo de São Jorge', description: 'Moorish castle walls, shaded courtyards and peacocks, with a view over the Baixa grid.', category: 'sight', durationMinutes: 90, area: 'Castelo', tip: 'Walk the ramparts clockwise to end at the best river view.' },
        { id: 'sample-s4', time: '12:30', title: 'Lunch at a tasca in Alfama', description: 'Grilled sardines or bitoque at one of the small family places on the lanes below the cathedral.', category: 'food', durationMinutes: 75, area: 'Alfama', tip: null },
        { id: 'sample-s5', time: '14:30', title: 'Museu Nacional do Azulejo', description: 'Five centuries of Portuguese tiles in a former convent; a short museum that even non-museum people enjoy.', category: 'sight', durationMinutes: 90, area: 'Xabregas', tip: 'The café garden is a calm place to rest your legs.' },
        { id: 'sample-s6', time: '18:30', title: 'Sunset at Miradouro de Santa Luzia', description: 'Tiled terrace with bougainvillea and a view over Alfama rooftops to the Tagus.', category: 'sight', durationMinutes: 45, area: 'Alfama', tip: null },
        { id: 'sample-s7', time: '20:30', title: 'Fado dinner in Alfama', description: 'A small fado house where the singing happens between courses. Expect a minimum spend.', category: 'nightlife', durationMinutes: 150, area: 'Alfama', tip: 'Choose a place where the musicians perform unamplified.' },
      ],
    },
    {
      id: 'sample-d2',
      title: 'Sintra in the hills',
      summary: 'A day trip to romantic palaces and forest paths, back in time for dinner by the river.',
      stops: [
        { id: 'sample-s8', time: '08:10', title: 'Train from Rossio to Sintra', description: 'A 40-minute ride from the neo-Manueline station in the centre of town.', category: 'transit', durationMinutes: 45, area: 'Rossio', tip: null },
        { id: 'sample-s9', time: '09:30', title: 'Pena Palace', description: 'Saturated yellow and red palace on a hilltop, best seen before the tour groups arrive.', category: 'sight', durationMinutes: 120, area: 'Sintra', tip: 'The park ticket alone is enough if you only want the terraces.' },
        { id: 'sample-s10', time: '12:00', title: 'Walk down to the Moorish Castle', description: 'A forest path along the ridge to the ninth-century walls, with views to the Atlantic.', category: 'nature', durationMinutes: 75, area: 'Sintra', tip: null },
        { id: 'sample-s11', time: '13:30', title: 'Travesseiros at Piriquita', description: 'Puff pastry pillows filled with almond cream, a Sintra classic since 1862.', category: 'food', durationMinutes: 30, area: 'Sintra village', tip: null },
        { id: 'sample-s12', time: '14:30', title: 'Quinta da Regaleira', description: 'Gardens of grottoes, towers and the spiral Initiation Well.', category: 'sight', durationMinutes: 120, area: 'Sintra', tip: 'Bring a phone light for the tunnels that link the wells.' },
        { id: 'sample-s13', time: '19:30', title: 'Seafood dinner in Cais do Sodré', description: 'Clams à Bulhão Pato and grilled fish near the waterfront after the train back.', category: 'food', durationMinutes: 90, area: 'Cais do Sodré', tip: null },
      ],
    },
    {
      id: 'sample-d3',
      title: 'Belém and Príncipe Real',
      summary: 'Riverside monuments in the morning, then gardens, shops and a long last evening up the hill.',
      stops: [
        { id: 'sample-s14', time: '09:00', title: 'Jerónimos Monastery cloister', description: 'Intricate limestone cloister in the Manueline style, best in morning light.', category: 'sight', durationMinutes: 75, area: 'Belém', tip: null },
        { id: 'sample-s15', time: '10:30', title: 'Pastéis de Belém', description: 'The original custard tarts, warm from the oven with cinnamon and sugar.', category: 'food', durationMinutes: 30, area: 'Belém', tip: 'Skip the takeaway queue and take a table inside; it moves faster.' },
        { id: 'sample-s16', time: '11:15', title: 'Riverside walk to the MAAT', description: 'Follow the river past the Padrão dos Descobrimentos to the wave-shaped roof of the MAAT.', category: 'nature', durationMinutes: 60, area: 'Belém', tip: 'You can walk over the MAAT roof for free.' },
        { id: 'sample-s17', time: '13:30', title: 'Lunch at Time Out Market', description: 'Stalls from well-known Lisbon kitchens under one roof; good for trying several dishes.', category: 'food', durationMinutes: 60, area: 'Cais do Sodré', tip: null },
        { id: 'sample-s18', time: '15:00', title: 'Embaixada and Príncipe Real', description: 'Browse Portuguese design shops in a neo-Moorish palace, then the garden with its giant cedar.', category: 'shopping', durationMinutes: 90, area: 'Príncipe Real', tip: null },
        { id: 'sample-s19', time: '18:00', title: 'Miradouro de São Pedro de Alcântara', description: 'Garden viewpoint facing the castle across the valley as the light turns gold.', category: 'sight', durationMinutes: 45, area: 'Bairro Alto', tip: null },
        { id: 'sample-s20', time: '20:00', title: 'Petiscos in Bairro Alto', description: 'Small plates and vinho verde, then follow the crowd onto the lanes.', category: 'nightlife', durationMinutes: 120, area: 'Bairro Alto', tip: null },
      ],
    },
  ],
};

/** The sample as a model would return it: an envelope with no ids. */
export function sampleAsModelOutput() {
  return {
    status: 'ok',
    itinerary: {
      ...SAMPLE_ITINERARY,
      days: SAMPLE_ITINERARY.days.map(({ id: _id, ...day }) => ({
        ...day,
        stops: day.stops.map(({ id: _sid, ...stop }) => ({ ref: null, ...stop })),
      })),
    },
  };
}
