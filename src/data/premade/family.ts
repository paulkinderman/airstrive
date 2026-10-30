import type { StarterGrid } from '../types';

/**
 * Paul's grid for his family's Thanksgiving in Alpharetta. It is a private grid to share
 * with the family, so it is not in PREMADE and does not go in the Atlas.
 */
export const kinderMemories: StarterGrid = {
  id: 'grid_kinder_memories',
  title: 'Kinder-memories',
  color: '#C4612D',
  theme: 'Family',
  size: 'tiny',
  description: 'Thanksgiving in Alpharetta, all of us together. Start before the trip and be ridiculous along the way.',
  clusters: [
    {
      name: 'Getting there',
      prompts: [
        'Share a favorite photo from a past Thanksgiving',
        'Pack one ridiculous item for no reason',
        'Send a selfie from the road or the gate',
        'Narrate the drive like a nature documentary',
        'Arrive and hug everyone at the door',
      ],
    },
    {
      name: 'Thanksgiving Day',
      prompts: [
        'Make name cards with unflattering nicknames',
        'Say what you are grateful for this year',
        'Commentate the football like it is the parade',
        'Take a photo of the whole table',
        'Have pie for breakfast the next morning',
      ],
    },
    {
      name: 'All together',
      prompts: [
        'Stroll Avalon together after dark',
        'Recreate an old family photo, pose for pose',
        'Lose the remote and blame the youngest',
        'Stage a cousins talent show',
        'Play a board game across the generations',
      ],
    },
    {
      name: 'Keep the memories',
      prompts: [
        'Take a photo with every generation',
        'Record a grandparent telling a story',
        'Do your best impression of another Kinderman',
        'Hand out awards for the funniest moments',
        'Start a new Kinderman tradition',
      ],
    },
  ],
};
