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
  size: 'small',
  description: 'Thanksgiving in Alpharetta, all of us together. Start before the trip, finish before the leftovers do, and be ridiculous along the way.',
  clusters: [
    {
      name: 'Before we go',
      prompts: [
        'Share a favorite photo from a past Thanksgiving',
        'Text the family your most dramatic travel forecast',
        'Pick a dish you are bringing or making',
        'Ask the hosts what they need help with',
        'Dig up an old family recipe',
        'Make a road trip playlist for the family',
        'Pack one ridiculous item for no reason',
        'Write down a story you want to tell',
      ],
    },
    {
      name: 'Getting there',
      prompts: [
        'Send a selfie from the road or the gate',
        'Stop for boiled peanuts or a peach treat',
        'Play a car game the whole family knows',
        'Spot a license plate from your home state',
        'Arrive and hug everyone at the door',
        'Bring a small gift from your own city',
        'Invent a terrible new name for the rental car',
        'Narrate the drive like a nature documentary',
      ],
    },
    {
      name: 'Thanksgiving Day',
      prompts: [
        'Help in the kitchen with a family dish',
        'Make name cards with unflattering nicknames',
        'Say what you are grateful for this year',
        'Wear the stretchy pants and say so proudly',
        'Take a photo of the whole table',
        'Commentate the football like it is the parade',
        'Go on the after-dinner walk',
        'Have pie for breakfast the next morning',
      ],
    },
    {
      name: 'Around Alpharetta',
      prompts: [
        'Stroll Avalon together after dark',
        'Walk a stretch of the Big Creek Greenway',
        'Do a dramatic slow-motion walk downtown',
        'See the holiday lights at Avalon',
        'Take the kids to Wills Park',
        'Recreate an old family photo, pose for pose',
        'Find a new favorite local restaurant',
        'Visit the Chattahoochee Nature Center',
      ],
    },
    {
      name: 'All together',
      prompts: [
        'Play a board game across the generations',
        'Hold a turkey trot with a silly prize',
        'Teach a younger cousin a card game',
        'Lose the remote and blame the youngest',
        'Watch an old family movie together',
        'Stage a cousins talent show',
        'Stay up late talking with a sibling',
        'Serve breakfast in a terrible fake accent',
      ],
    },
    {
      name: 'Keep the memories',
      prompts: [
        'Take a photo with every generation',
        'Record a grandparent telling a story',
        'Do your best impression of another Kinderman',
        'Find the most embarrassing photo in the albums',
        'Learn something new about a relative',
        'Start a new Kinderman tradition',
        'Hand out awards for the funniest moments',
        'Pick the best moment of the trip',
      ],
    },
  ],
};
