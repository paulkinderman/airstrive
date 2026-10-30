import type { StarterGrid } from '../types';

export const thanksgiving: StarterGrid = {
  id: 'grid_thanksgiving',
  title: 'Thanksgiving Day',
  color: '#C4612D',
  theme: 'Seasons',
  size: 'tiny',
  description: 'One long day of food, family and football. Small enough to finish before the pie is gone.',
  clusters: [
    {
      name: 'Kitchen',
      prompts: [
        'Help with a dish you have never made',
        'Taste the gravy before anyone else',
        'Make the cranberry sauce from scratch',
        'Set the table like it matters',
        'Wash dishes with someone you rarely see',
      ],
    },
    {
      name: 'Table',
      prompts: [
        'Say one thing you are grateful for',
        'Sit next to someone new',
        'Ask the oldest person for a childhood story',
        'Start a toast that gets out of hand',
        'Try every side dish at least once',
      ],
    },
    {
      name: 'After dinner',
      prompts: [
        'Watch the parade, or at least the balloons',
        'Toss a football in the yard',
        'Take the after-dinner walk',
        'Nap on the couch without shame',
        'Play a game with three generations',
      ],
    },
    {
      name: 'Leftovers',
      prompts: [
        'Build the perfect leftover sandwich',
        'Pack a plate for someone who could not come',
        'Eat pie for breakfast',
        'Call someone who is far away',
        'Write down the recipe before it is lost',
      ],
    },
  ],
};

export const halloween: StarterGrid = {
  id: 'grid_halloween',
  title: 'Halloween Night',
  color: '#9C8CB8',
  theme: 'Seasons',
  size: 'tiny',
  description: 'Just the one night. Costumes, candy and a little bit of fright.',
  clusters: [
    {
      name: 'Costume',
      prompts: [
        'Make a costume from things you own',
        'Wear your costume all day, not just tonight',
        'Coordinate costumes with a friend',
        'Paint your face',
        'Compliment the best costume you see',
      ],
    },
    {
      name: 'Candy',
      prompts: [
        'Hand out the good candy',
        'Trick or treat, at any age',
        'Trade candy for your favorite kind',
        'Leave a bowl out for latecomers',
        'Eat candy corn and form an opinion',
      ],
    },
    {
      name: 'Spooky',
      prompts: [
        'Carve a pumpkin with a scary face',
        'Watch a horror movie with the lights off',
        'Tell a ghost story by candlelight',
        'Walk past the creepiest house on the block',
        'Go through a haunted house or hayride',
      ],
    },
    {
      name: 'Neighbors',
      prompts: [
        'Decorate the porch',
        'Find the most decorated house nearby',
        'Join a costume party, or throw one',
        'Roast the pumpkin seeds',
        'Walk a little one around the block',
      ],
    },
  ],
};

export const barCrawl: StarterGrid = {
  id: 'grid_bar_crawl',
  title: 'Bar Crawl',
  color: '#F0634A',
  theme: 'People',
  size: 'tiny',
  description: 'One neighborhood, a few stops, good friends. Take it slow and get everyone home safe.',
  clusters: [
    {
      name: 'Stops',
      prompts: [
        'Start at a dive bar',
        'Find a bar with a jukebox',
        'Go up to a rooftop bar',
        'Find a place with live music',
        'End somewhere that serves late food',
      ],
    },
    {
      name: 'Order',
      prompts: [
        'Order the house special',
        'Ask the bartender for their favorite',
        'Try a drink you cannot pronounce',
        'Order a mocktail and mean it',
        'Split a round of appetizers',
      ],
    },
    {
      name: 'Crew',
      prompts: [
        'Make a toast at every stop',
        'Take a group photo at each bar',
        'Bring along a friend of a friend',
        'Learn the name of a stranger',
        'Play pool, darts or trivia',
      ],
    },
    {
      name: 'Look after each other',
      prompts: [
        'Drink a water between every stop',
        'Sort out the ride home first',
        'Walk between stops',
        'Tip the bartender well',
        'Get everyone home safe',
      ],
    },
  ],
};

export const snowDay: StarterGrid = {
  id: 'grid_snow_day',
  title: 'Snow Day',
  color: '#4C6EB1',
  theme: 'Seasons',
  size: 'tiny',
  description: 'School is canceled and the world has gone quiet. Make the most of it.',
  clusters: [
    {
      name: 'Outside',
      prompts: [
        'Build a snowman with a personality',
        'Make a snow angel',
        'Go sledding on the best hill',
        'Have a snowball fight',
        'Catch a snowflake on your tongue',
      ],
    },
    {
      name: 'Inside',
      prompts: [
        'Make hot chocolate from scratch',
        'Build a blanket fort',
        'Bake cookies for no reason',
        'Do a puzzle on the floor',
        'Watch a movie in pajamas',
      ],
    },
    {
      name: 'Helping',
      prompts: [
        'Shovel the walk for a neighbor',
        'Fill the bird feeder',
        'Check on someone who lives alone',
        'Clear the snow off a car that is not yours',
        'Have cocoa ready for whoever comes in',
      ],
    },
    {
      name: 'Noticing',
      prompts: [
        'Follow animal tracks in the snow',
        'Take a walk while it is still falling',
        'Photograph your street under snow',
        'Listen to how quiet it gets',
        'Look at a snowflake up close',
      ],
    },
  ],
};

export const morningReset: StarterGrid = {
  id: 'grid_morning_reset',
  title: 'Morning Reset',
  color: '#2EB08A',
  theme: 'Wellness',
  size: 'tiny',
  description: 'Small ways to start the day on your own side. Pick one each morning.',
  clusters: [
    {
      name: 'Wake',
      prompts: [
        'Get up without hitting snooze',
        'Open the curtains first thing',
        'Make the bed right away',
        'Drink a full glass of water',
        'Stretch before you check your phone',
      ],
    },
    {
      name: 'Move',
      prompts: [
        'Walk around the block before breakfast',
        'Do a few sun salutations',
        'Dance to one song in the kitchen',
        'Step outside barefoot for a moment',
        'Take the stairs on purpose',
      ],
    },
    {
      name: 'Fuel',
      prompts: [
        'Eat breakfast sitting down',
        'Make your coffee slowly and watch it',
        'Try a new breakfast',
        'Pack lunch the night before',
        'Eat something green before noon',
      ],
    },
    {
      name: 'Mind',
      prompts: [
        'Write three lines in a journal',
        'Read a page of something good',
        'Sit still and just breathe for a bit',
        'Pick the one thing that matters today',
        'Leave the news for later',
      ],
    },
  ],
};

export const rainyDay: StarterGrid = {
  id: 'grid_rainy_day',
  title: 'Rainy Day',
  color: '#3B9BE0',
  theme: 'Family',
  size: 'tiny',
  description: 'Stuck inside with the whole family and nowhere to be. Good.',
  clusters: [
    {
      name: 'Play',
      prompts: [
        'Build the biggest pillow fort yet',
        'Play hide and seek in the house',
        'Have an indoor picnic',
        'Put on a puppet show',
        'Invent a board game',
      ],
    },
    {
      name: 'Make',
      prompts: [
        'Bake something messy together',
        'Paint at the kitchen table',
        'Fold paper boats',
        'Write and illustrate a tiny book',
        'Build a marble run from the recycling',
      ],
    },
    {
      name: 'Out anyway',
      prompts: [
        'Jump in a puddle on purpose',
        'Walk in the rain with no umbrella',
        'Race paper boats down the gutter',
        'Look for worms after the rain',
        'Watch a storm from the porch',
      ],
    },
    {
      name: 'Cozy',
      prompts: [
        'Read aloud under a blanket',
        'Have a family movie marathon',
        'Make soup together',
        'Look through old photo albums',
        'Nap while the rain falls',
      ],
    },
  ],
};

export const dateNight: StarterGrid = {
  id: 'grid_date_night',
  title: 'Date Night',
  color: '#D4A190',
  theme: 'People',
  size: 'tiny',
  description: 'A few nights out, or in, with your person. Not a checklist, a nudge.',
  clusters: [
    {
      name: 'Out',
      prompts: [
        'Try a restaurant neither of you knows',
        'See live music somewhere small',
        'Go dancing, however badly',
        'Sit at the bar instead of a table',
        'Take a sunset walk somewhere new',
      ],
    },
    {
      name: 'In',
      prompts: [
        'Cook a meal neither of you has made',
        'Recreate your first date at home',
        'Have a candlelit dinner on a weeknight',
        'Build a playlist together',
        'Do a puzzle and talk the whole time',
      ],
    },
    {
      name: 'Play',
      prompts: [
        'Play a game where the loser cooks',
        'Go to a trivia night as a team',
        'Go bowling or find an arcade',
        'Take a class together',
        'Plan a surprise date for the other',
      ],
    },
    {
      name: 'Talk',
      prompts: [
        'Ask a question you have never asked',
        'Look through old photos together',
        'Write each other a short letter',
        'Plan a trip you might actually take',
        'Leave the phones in another room',
      ],
    },
  ],
};

export const sundayReset: StarterGrid = {
  id: 'grid_sunday_reset',
  title: 'Sunday Reset',
  color: '#9C8CB8',
  theme: 'Wellness',
  size: 'tiny',
  description: 'Get the week ahead ready while being gentle with the week behind.',
  clusters: [
    {
      name: 'Home',
      prompts: [
        'Change the sheets',
        'Clear the drawer that bugs you',
        'Water every plant',
        'Take out the recycling',
        'Tidy one room completely',
      ],
    },
    {
      name: 'Prep',
      prompts: [
        'Plan meals for the week',
        'Cook a big pot of something',
        'Lay out clothes for tomorrow',
        'Look at the calendar for the week',
        'Clean out your inbox',
      ],
    },
    {
      name: 'Rest',
      prompts: [
        'Take a long bath or shower',
        'Read for fun, not for work',
        'Nap without setting an alarm',
        'Go for a slow walk',
        'Do nothing for a while on purpose',
      ],
    },
    {
      name: 'Connect',
      prompts: [
        'Call a parent or a grandparent',
        'Text a friend you miss',
        'Have a slow family breakfast',
        'Write a thank you note',
        'Name the best part of the week',
      ],
    },
  ],
};

export const gameNight: StarterGrid = {
  id: 'grid_game_night',
  title: 'Game Night',
  color: '#F5B61C',
  theme: 'Games',
  size: 'tiny',
  description: 'Clear the table and get some people round. Everything here works for a mix of ages.',
  clusters: [
    {
      name: 'Cards',
      prompts: [
        'Teach someone a card game',
        'Play a round of spoons',
        'Play a game of hearts',
        'Learn a fancy shuffle',
        'Play poker for pretzels',
      ],
    },
    {
      name: 'Board',
      prompts: [
        'Play a classic you loved as a kid',
        'Try a brand new board game',
        'Play a cooperative game',
        'Finish a game that takes all night',
        'Improvise around the missing pieces',
      ],
    },
    {
      name: 'Party',
      prompts: [
        'Play charades with movie titles',
        'Draw your way through a sketch game',
        'Play a word game where nobody wins',
        'Play twenty questions',
        'Host a trivia round you wrote yourself',
      ],
    },
    {
      name: 'Hosting',
      prompts: [
        'Make a snack board for the table',
        'Find a trophy in the junk drawer',
        'Let the youngest player pick the game',
        'Invite a neighbor to join',
        'Keep the scores on a chalkboard',
      ],
    },
  ],
};

export const workHolidayParty: StarterGrid = {
  id: 'grid_work_holiday_party',
  title: 'Work Holiday Party',
  color: '#F0634A',
  theme: 'People',
  size: 'tiny',
  description: 'Dinner and drinks in London with the whole team. Festive, friendly and office safe.',
  clusters: [
    {
      name: 'Arrive',
      prompts: [
        'Wear your best festive jumper',
        'Swap festive greetings at the door',
        'Snap the Christmas lights on the way',
        'Order a festive drink',
        'Spot the best festive jumper in the room',
      ],
    },
    {
      name: 'Mingle',
      prompts: [
        'Learn what a coworker does outside work',
        'Sit next to someone you rarely talk to',
        'Ask a colleague for their best London find',
        "Find out someone's favorite holiday tradition",
        'Learn where everyone is off to for the holidays',
      ],
    },
    {
      name: 'Fun',
      prompts: [
        'Tell the funniest story of your year',
        'Start a round of would you rather',
        'Get in a group photo with your team',
        'Share a dessert with the people beside you',
        'Order something new from the drinks menu',
      ],
    },
    {
      name: 'Wrap up',
      prompts: [
        'Thank someone who made your year easier',
        'Toast a coworker who had a big year',
        'Say goodbye to everyone before you leave',
        'Make lunch plans with a teammate for January',
        'Go home with a new inside joke',
      ],
    },
  ],
};

export const TINY: StarterGrid[] = [
  thanksgiving, halloween, barCrawl, snowDay, morningReset, rainyDay, dateNight, sundayReset, gameNight,
  workHolidayParty,
];
