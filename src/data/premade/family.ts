import type { StarterGrid } from '../types';

/**
 * Paul's grid for his family to fill in on the way to Thanksgiving in Alpharetta. It is
 * seeded as an official Atlas grid alongside PREMADE.
 */
export const kinderMemories: StarterGrid = {
  id: 'grid_kinder_memories',
  title: 'Kinder-memories',
  color: '#C4612D',
  theme: 'Family',
  size: 'tiny',
  description: 'Getting ready for Thanksgiving in Alpharetta, all of us together. Start now and be ridiculous along the way.',
  clusters: [
    {
      name: 'Getting there',
      prompts: [
        'Predict who arrives last, then gloat',
        'Pack one ridiculous item for no reason',
        'Send a selfie from the road or the gate',
        'Make up a song about the trip',
        'Arrive and hug everyone at the door',
      ],
    },
    {
      name: 'Before the trip',
      prompts: [
        'Practice your best turkey gobble',
        'Call a cousin you will see there',
        'Start a countdown in the family chat',
        'Text the family a throwback photo',
        'Pick a dish to bring and keep it secret',
      ],
    },
    {
      name: 'All together',
      prompts: [
        'Stroll Avalon together after dark',
        'Recreate an old family photo, pose for pose',
        'Hold a family thumb war tournament',
        'Take a group photo making turkey faces',
        'Play a board game across the generations',
      ],
    },
    {
      name: 'Keep the memories',
      prompts: [
        'Ask a grandparent to save a story for you',
        'Record a grandparent telling a story',
        'Do your best impression of another Kinderman',
        'Nominate someone for a made-up family award',
        'Start a new Kinderman tradition',
      ],
    },
  ],
};
