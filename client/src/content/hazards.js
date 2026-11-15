/**
 * The five hazards of human spaceflight as framed by the NASA Human
 * Research Program (often summarised as "RIDGE"). Descriptions are written
 * in plain language for this demo; see SOURCES in config/thresholds.js.
 */
export const HAZARDS = {
  radiation: {
    id: 'radiation',
    label: 'Space radiation',
    short: 'Radiation',
    summary:
      'Outside Earth’s magnetic field, galactic cosmic rays and solar particle events raise cancer risk and can affect the nervous system, heart and bone marrow.',
    countermeasures: ['Shielding and storm shelters', 'Personal dosimeters', 'Mission timing around solar activity'],
    sources: ['HRP_BODY', 'HRP_HAZARDS'],
  },
  isolation: {
    id: 'isolation',
    label: 'Isolation and confinement',
    short: 'Isolation',
    summary:
      'Months in a small space with the same few people can disturb sleep, mood, teamwork and thinking.',
    countermeasures: ['Regular private conferences with family', 'Protected sleep periods', 'Exercise and leisure time'],
    sources: ['HRP_BODY', 'HRP_HAZARDS'],
  },
  distance: {
    id: 'distance',
    label: 'Distance from Earth',
    short: 'Distance',
    summary:
      'Far from Earth, communication is delayed and there is no quick way home, so the crew must handle medical problems themselves.',
    countermeasures: ['On-board medical kit and training', 'Self-care protocols', 'Decision-support tools like Evexia'],
    sources: ['HRP_BODY', 'HRP_HAZARDS'],
  },
  gravity: {
    id: 'gravity',
    label: 'Gravity fields',
    short: 'Gravity',
    summary:
      'Weightlessness and partial gravity shift body fluids toward the head and weaken bones, muscles and the cardiovascular system.',
    countermeasures: ['Daily resistance and aerobic exercise', 'Fluid and salt loading before landing', 'Compression garments'],
    sources: ['HRP_BODY', 'HRP_HAZARDS'],
  },
  hostileEnvironment: {
    id: 'hostileEnvironment',
    label: 'Hostile and closed environments',
    short: 'Closed environment',
    summary:
      'The spacecraft is a sealed habitat: air quality, CO₂, noise, temperature, lighting and microbes all affect health.',
    countermeasures: ['Air and water monitoring', 'Hygiene and microbial control', 'Lighting that supports the body clock'],
    sources: ['HRP_BODY', 'HRP_HAZARDS'],
  },
};

export const HAZARD_IDS = Object.keys(HAZARDS);
