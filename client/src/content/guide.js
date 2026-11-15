/**
 * Measurement guide content: plain language, no medical background needed.
 * Edit freely; the Measurement Guide page renders this file directly.
 */
export const GUIDE = [
  {
    id: 'hr',
    title: 'Resting heart rate',
    unit: 'bpm',
    device: 'Wrist tracker or chest-strap ECG',
    what: 'How many times your heart beats in one minute while you are fully at rest.',
    whySpace:
      'In weightlessness your heart does less work and can shrink slightly. Stress, poor sleep, fever and dehydration all push resting heart rate up, so a change is an early warning sign.',
    steps: [
      'Measure after waking, before coffee or exercise.',
      'Stay still and quiet for 5 minutes. Anchor yourself so you are not floating.',
      'Wear the tracker snug on the wrist (or the chest strap below the chest muscles).',
      'Read the average over 1 minute and enter it.',
    ],
    normal: '50 to 90 bpm',
    worry: 'Below 40 or above 100 at rest, or if you feel dizzy, short of breath or have chest pain.',
    hazard: 'gravity',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  {
    id: 'bp',
    title: 'Blood pressure',
    unit: 'mmHg',
    device: 'Automatic blood pressure cuff',
    what: 'The pressure in your arteries when the heart beats (systolic, top number) and between beats (diastolic, bottom number).',
    whySpace:
      'Body fluids shift toward the head in microgravity. The heart and blood vessels adapt, which can change blood pressure and cause dizziness when returning to gravity.',
    steps: [
      'Rest quietly for 5 minutes with your feet secured in foot loops.',
      'Wrap the cuff on the bare upper arm, at heart level, tube over the inner elbow.',
      'Keep the arm relaxed and supported; do not talk.',
      'Press start. Record both numbers. Repeat after 1 minute and use the average.',
    ],
    normal: '95 to 129 over 60 to 84 mmHg',
    worry: '140/90 or higher, or below 90/60, or with headache, vision changes or fainting.',
    hazard: 'gravity',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  {
    id: 'glucose',
    title: 'Fasting blood glucose',
    unit: 'mg/dL',
    device: 'Glucometer (finger-prick)',
    what: 'The amount of sugar in your blood after at least 8 hours without food.',
    whySpace:
      'Inactivity, stress hormones, sleep loss and radiation can make the body handle sugar less well. (A flight-specific source for this is still to be verified.)',
    steps: [
      'Measure in the morning before eating.',
      'Wash and dry your hands; use the alcohol wipe and let it dry.',
      'Insert a test strip, prick the side of a fingertip and touch the blood to the strip.',
      'Contain the lancet and wipe in the sharps container. Enter the reading.',
    ],
    normal: '65 to 99 mg/dL (Inspiration4 crew lab normal range, NASA OSDR)',
    worry: '126 or higher (high) or below 60 (low). If low and shaky or confused, take fast sugar now.',
    hazard: 'hostileEnvironment',
    sources: ['OSDR_I4', 'HRP_HAZARDS'],
  },
  {
    id: 'temp',
    title: 'Body temperature',
    unit: '°C',
    device: 'Digital thermometer (oral or temporal)',
    what: 'Your core body temperature.',
    whySpace:
      'Astronaut core temperature tends to run a little higher in flight. A fever in a closed cabin can mean infection that may spread to the crew; exercise and suit work can also overheat you.',
    steps: [
      'Wait 15 minutes after eating, drinking or exercise.',
      'Place the thermometer under the tongue and close your lips (or scan the forehead).',
      'Wait for the beep and read the value.',
      'Clean the probe with a wipe and enter the value.',
    ],
    normal: '36.1 to 37.2 °C',
    worry: 'Above 38.0 °C (fever) or below 35.0 °C (hypothermia, NASA-STD-3001), especially with chills, confusion or rash.',
    hazard: 'hostileEnvironment',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  {
    id: 'sleep',
    title: 'Sleep',
    unit: 'hours per night',
    device: 'Wrist or sleep tracker (actigraphy)',
    what: 'How many hours you actually slept last night.',
    whySpace:
      'No sunrise or sunset, noise, light, workload and stress disrupt the body clock. NASA-STD-3001 recommends an 8.5-hour sleep period; Evexia counts 7 hours of actual sleep as green. Lack of sleep hurts alertness, mood and decisions.',
    steps: [
      'Wear the tracker every night on the same wrist.',
      'In the morning, open the tracker summary.',
      'Enter total sleep time, not time in the sleeping bag.',
      'Note anything that disturbed you (noise, light, worry) in the crew log.',
    ],
    normal: '7 hours or more',
    worry: 'Below 6 hours for 2 nights in a row, or below 5 hours in one night.',
    hazard: 'isolation',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  {
    id: 'radiation',
    title: 'Radiation dose rate',
    unit: 'mGy/day (absorbed)',
    device: 'Personal dosimeter (active)',
    what: 'The radiation dose your dosimeter absorbed in the last 24 hours, in milligray (mGy). Evexia converts it to an estimated effective dose (mSv) for the NASA limits.',
    whySpace:
      'Beyond Earth’s magnetic field, cosmic rays and solar particle events add dose that raises long-term cancer risk and can harm bone marrow and the nervous system.',
    steps: [
      'Wear the dosimeter on your torso at all times (chest pocket).',
      'Once a day, read the 24-hour dose on the display or sync it.',
      'If the solar particle event alarm sounds, go to the storm shelter first and log later.',
      'Enter the daily absorbed dose in mGy. Evexia estimates mSv and keeps the cumulative total.',
    ],
    normal: 'Typical measured values: ISS about 0.4–0.5 mGy/day, Mars surface about 0.1 mGy/day (NASA RadLab)',
    worry: 'Estimated above 2.0 mSv/day, any solar particle event alert, more than 250 mSv in one event, or cumulative dose above 80% of the 600 mSv career limit.',
    hazard: 'radiation',
    sources: ['STD3001_RAD', 'RADLAB'],
  },
];
