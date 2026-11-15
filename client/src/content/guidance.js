/**
 * Rule-based guidance. Used by the Alerts screen AND as the assistant's
 * offline fallback (no API key / API unreachable). Plain language, never a
 * diagnosis. Each entry lists self-care steps (shown first when the Earth
 * link delay is long), actions, a countermeasure, the related hazard and
 * source tags.
 */
export const GUIDANCE = {
  spo2: {
    hazard: 'hostileEnvironment',
    why: 'In a sealed cabin the air is made by machines. A leak, a fault in the air system, high carbon dioxide or a chest infection can lower the oxygen in your blood, and the first signs (headache, breathlessness, poor focus) are easy to miss.',
    amber: {
      meaning: 'Your blood oxygen is a little low. Cold fingers, movement or a loose sensor often cause this, so measure again before worrying.',
      selfCare: ['Warm your hands, keep still and re-measure on another finger.', 'Sit upright and take slow, deep breaths for 2 minutes, then measure again.', 'Tell a crewmate and check the cabin air readings (oxygen and carbon dioxide).'],
      actions: ['Re-check in 15 minutes and again within the hour.', 'Note any breathlessness, cough, headache or confusion.'],
    },
    red: {
      meaning: 'Your blood oxygen is low. Breathing comes first in any emergency, so this needs care now.',
      selfCare: ['Stop what you are doing, sit upright and breathe slowly.', 'Alert your crew medical officer now; if you are short of breath, confused or your lips look blue, open emergency mode.', 'Ask a crewmate to check the cabin air system and use supplemental oxygen as your crew is trained to.'],
      actions: ['Escalate to the flight surgeon with this report.', 'Re-measure every 5 minutes and do not stay alone.'],
    },
    countermeasure: 'Continuous cabin air monitoring (oxygen and carbon dioxide) and a pulse oximeter check whenever you feel short of breath or unusually tired.',
    sources: ['CLINICAL_REF', 'HRP_HAZARDS'],
  },
  hr: {
    hazard: 'gravity',
    why: 'Your heart adapts to weightlessness. A resting heart rate that changes can point to stress, poor sleep, dehydration, fever or deconditioning.',
    amber: {
      meaning: 'Your resting heart rate is outside the usual range. This is often caused by stress, short sleep, caffeine or dehydration.',
      selfCare: ['Rest quietly for 10 minutes and re-measure.', 'Drink 500 mL of water.', 'Avoid caffeine and hard exercise until it settles.'],
      actions: ['Re-check in 1 hour and again tomorrow morning.', 'Log how you feel (stress, palpitations).'],
    },
    red: {
      meaning: 'Your resting heart rate is far outside the safe range. It needs attention today.',
      selfCare: ['Stop all activity, anchor yourself and rest.', 'If you have chest pain, fainting or shortness of breath, alert your crew medical officer now.', 'Re-measure in 5 minutes using the ECG.'],
      actions: ['Escalate to the flight surgeon with this report.', 'Ask a crewmate to stay with you until it settles.'],
    },
    countermeasure: 'Daily aerobic exercise on the cycle ergometer or treadmill keeps the heart conditioned.',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  bp: {
    hazard: 'gravity',
    why: 'Fluids shift toward the head in microgravity and the cardiovascular system adapts. Blood pressure that is too high or too low can cause headaches, vision changes or fainting on return to gravity.',
    amber: {
      meaning: 'Your blood pressure is slightly outside range. One reading is not a trend: measure again.',
      selfCare: ['Rest 5 minutes and repeat the measurement correctly.', 'Reduce salt in your next meals.', 'Take a short relaxation break (slow breathing for 5 minutes).'],
      actions: ['Measure twice a day for 3 days.', 'Review workload and sleep.'],
    },
    red: {
      meaning: 'Your blood pressure is in the red zone. Very high or very low pressure needs attention today.',
      selfCare: ['Stop exertion and rest.', 'If low: lie down with legs raised and drink fluids.', 'If high with headache or vision change: alert your crew medical officer now.'],
      actions: ['Escalate to the flight surgeon with this report.', 'Repeat the measurement every 15 minutes for 1 hour.'],
    },
    countermeasure: 'Resistance and aerobic exercise, fluid and salt protocols, and compression garments around gravity transitions.',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  glucose: {
    hazard: 'hostileEnvironment',
    why: 'Inactivity, stress hormones, poor sleep and diet changes can make the body handle sugar less well during long missions.',
    amber: {
      meaning: 'Your fasting glucose is a little outside range. Diet, sleep or a missed exercise session may be the cause.',
      selfCare: ['If slightly low: eat a small snack with carbohydrate.', 'If slightly high: choose lower-sugar meals today and complete your exercise session.', 'Re-test tomorrow while fasting.'],
      actions: ['Track meals for 3 days.', 'Check that you measured truly fasting (8 h without food).'],
    },
    red: {
      meaning: 'Your fasting glucose is in the red zone. Very low glucose is urgent; high glucose needs follow-up.',
      selfCare: ['If below 60 and shaky, sweaty or confused: take 15 g of fast sugar now and re-test in 15 minutes.', 'If high: drink water, avoid sugary food and re-test in 2 hours.', 'Tell your crew medical officer.'],
      actions: ['Escalate to the flight surgeon with this report.', 'Test before each meal today.'],
    },
    countermeasure: 'Daily exercise, a balanced space diet and protected sleep keep blood sugar stable.',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  temp: {
    hazard: 'hostileEnvironment',
    why: 'In a sealed cabin an infection can spread to the whole crew, and the immune system changes in flight. Overheating can also happen during exercise or EVA.',
    amber: {
      meaning: 'Your temperature is slightly outside range. It may be exercise, a warm module, or the start of an illness.',
      selfCare: ['Rest in a cool module and drink fluids.', 'Re-measure in 1 hour, not right after exercise.', 'Wash hands and avoid sharing food or equipment.'],
      actions: ['Monitor for cough, sore throat, rash or chills.', 'Check cabin temperature and humidity.'],
    },
    red: {
      meaning: 'Your temperature is in the red zone (fever or too cold). It needs attention today.',
      selfCare: ['Rest and drink plenty of fluids.', 'Take a fever reducer from the medical kit only as the kit protocol says.', 'Limit contact with crewmates and wear a mask.'],
      actions: ['Escalate to the flight surgeon with this report.', 'Re-measure every 4 hours.'],
    },
    countermeasure: 'Hygiene, microbial monitoring of air, water and surfaces, and environmental control.',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  sleep: {
    hazard: 'isolation',
    why: 'Sleep loss is common in flight (light, noise, schedule, stress) and affects alertness, mood, teamwork and safety-critical tasks.',
    amber: {
      meaning: 'You slept less than the 7-hour target. One short night is common; several in a row add up.',
      selfCare: ['Keep the sleep station dark and use earplugs and an eye mask.', 'Avoid screens and caffeine in the 2 hours before sleep.', 'Use the scheduled pre-sleep wind-down time.'],
      actions: ['Aim for a full sleep period tonight.', 'Tell the crew if workload is cutting into sleep.'],
    },
    red: {
      meaning: 'Your sleep is in the red zone: very short, or short several nights in a row. This affects safety.',
      selfCare: ['Avoid safety-critical tasks (EVA, robotics, piloting) until you have slept.', 'Ask for a schedule change to protect a full sleep period.', 'Use the lighting protocol to reset your body clock.'],
      actions: ['Escalate to the flight surgeon with this report.', 'Log what is disturbing your sleep.'],
    },
    countermeasure: 'Circadian lighting, consistent schedules, quiet sleep stations and a private crew conference.',
    sources: ['HRP_HAZARDS', 'STD3001'],
  },
  radiation: {
    hazard: 'radiation',
    why: 'Beyond Earth’s magnetic field radiation dose is higher and solar particle events can deliver a large dose in hours.',
    amber: {
      meaning: 'Today’s dose rate is above the green limit for this environment.',
      selfCare: ['Sleep in the most shielded crew quarters.', 'Keep your dosimeter on your torso.', 'Limit time in lightly shielded modules.'],
      actions: ['Watch space-weather alerts.', 'Review planned EVA timing.'],
    },
    red: {
      meaning: 'Radiation is in the red zone: a very high dose rate or a solar particle event.',
      selfCare: ['Go to the storm shelter now and stay until the all-clear.', 'Bring water, food and your dosimeter.', 'Postpone all EVAs.'],
      actions: ['Escalate to the flight surgeon with this report.', 'Log your dosimeter reading after the event.'],
    },
    countermeasure: 'Storm shelter, water-wall and polyethylene shielding, dosimetry, and mission timing around solar activity.',
    sources: ['STD3001_RAD', 'HRP_HAZARDS'],
  },
};

export const GREEN_MESSAGE = 'Within range. Keep up your normal routine and measure again at the scheduled time.';
