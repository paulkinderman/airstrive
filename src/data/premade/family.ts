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
  description: 'Thanksgiving in Alpharetta, all of us together. Start before the trip and finish before the leftovers do.',
  clusters: [
    {
      name: 'Before we go',
      prompts: [
        'Share a favorite photo from a past Thanksgiving',
        'Call someone you will see there',
        'Pick a dish you are bringing or making',
        'Ask the hosts what they need help with',
        'Dig up an old family recipe',
        'Make a road trip playlist for the family',
        'Pack something to show the others',
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
        'Share the best thing you saw on the way',
        'Pick up someone else on the way in',
      ],
    },
    {
      name: 'Thanksgiving Day',
      prompts: [
        'Help in the kitchen with a family dish',
        'Set the table together',
        'Say what you are grateful for this year',
        'Sit next to someone you rarely see',
        'Take a photo of the whole table',
        'Watch the parade or the football together',
        'Go on the after-dinner walk',
        'Have pie for breakfast the next morning',
      ],
    },
    {
      name: 'Around Alpharetta',
      prompts: [
        'Stroll Avalon together after dark',
        'Walk a stretch of the Big Creek Greenway',
        'Get coffee downtown as a group',
        'See the holiday lights at Avalon',
        'Take the kids to Wills Park',
        'Walk the shops along Canton Street',
        'Find a new favorite local restaurant',
        'Visit the Chattahoochee Nature Center',
      ],
    },
    {
      name: 'All together',
      prompts: [
        'Play a board game across the generations',
        'Toss a football in the yard',
        'Teach a younger cousin a card game',
        'Do a puzzle that takes the whole visit',
        'Watch an old family movie together',
        'Have a cousins only outing',
        'Stay up late talking with a sibling',
        'Cook breakfast for everyone',
      ],
    },
    {
      name: 'Keep the memories',
      prompts: [
        'Take a photo with every generation',
        'Record a grandparent telling a story',
        'Write down a family recipe by hand',
        'Look through old family photo albums',
        'Learn something new about a relative',
        'Start a new Kinderman tradition',
        'Write a note for next Thanksgiving',
        'Pick the best moment of the trip',
      ],
    },
  ],
};
