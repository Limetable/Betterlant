import 'dotenv/config';
import mineflayer from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { Movements } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import fetch from 'node-fetch';
import readline from 'readline';

// Setup readline interface for receiving commands from Electron
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Ollama API configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const config = JSON.parse(process.argv[2]);

const bot = mineflayer.createBot({
  host: config.server,
  port: config.port,
  username: config.username,
  version: config.version
});

// Load pathfinder plugin
bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);

// Bot state for context
const botState = {
  inventory: [],
  nearbyEntities: [],
  conversationHistory: [],
  health: 0,
  hunger: 0,
  position: { x: 0, y: 0, z: 0 },
  lastAction: null,
  lastObservation: null,
  hasNotifiedCombat: false,
  lastAttacker: null
};

// Update bot state and send to UI
function updateBotState() {
  botState.inventory = bot.inventory.items();
  botState.nearbyEntities = Object.values(bot.entities);
  botState.health = bot.health;
  botState.hunger = bot.food;
  botState.position = bot.entity.position;

  // Send update to Electron
  sendToElectron({
    type: 'update',
    health: botState.health,
    hunger: botState.hunger,
    position: botState.position,
    lastAction: botState.lastAction,
    inventory: botState.inventory.map(item => ({
      name: item.name,
      count: item.count
    }))
  });
}

// Function to send data to Electron
function sendToElectron(data) {
  console.log(JSON.stringify(data));
}

async function aiDecisionLoop() {
  try {
    updateBotState();

    const observation = `
Environment observation:
- Ground: ${bot.blockAt(bot.entity.position.offset(0, -1, 0))?.name || 'unknown'}
- Time: ${bot.time.timeOfDay > 12000 ? 'Night' : 'Day'}
- Entities nearby: ${botState.nearbyEntities.length}
- Health status: ${bot.health < 10 ? 'Low' : 'Good'}
- Hunger status: ${bot.food < 10 ? 'Hungry' : 'Satisfied'}
    `;

    const action = await getAIDecision(observation);
    await executeAction(action);

  } catch (error) {
    console.error('Error in AI decision loop:', error);
  }
}

// Function to get AI response from Ollama
async function getAIDecision(observation) {
  botState.lastObservation = observation;

  // Keep track of conversation history for context
  if (botState.conversationHistory.length > 5) {
    // Keep only the last 5 exchanges to avoid context getting too long
    botState.conversationHistory = botState.conversationHistory.slice(
        botState.conversationHistory.length - 5
    );
  }

  const systemPrompt = `You are an AI controlling a Minecraft bot. You must decide what action to take based on the environment.
Always respond with ONLY ONE of these action keywords:
- MOVE_FORWARD
- MOVE_BACKWARD
- TURN_LEFT
- TURN_RIGHT
- JUMP
- ATTACK
- MINE
- PLACE
- COLLECT
- CRAFT

Do not include any explanation, just the action keyword.`;

  const userPrompt = `Current state:
- Health: ${botState.health}
- Hunger: ${botState.hunger}
- Position: x=${botState.position.x.toFixed(1)}, y=${botState.position.y.toFixed(1)}, z=${botState.position.z.toFixed(1)}
- Inventory: ${botState.inventory.map(item => `${item.count} ${item.name}`).join(', ') || 'Empty'}
- Nearby entities: ${botState.nearbyEntities.length > 0 ? botState.nearbyEntities.map(e => e.name || 'Unknown').join(', ') : 'None'}
- Last action: ${botState.lastAction || 'None'}
- Observation: ${observation}

Based on this information, what single action should I take next?`;

  // Combine history with current prompt
  const fullPrompt = [
    { role: "system", content: systemPrompt },
    ...botState.conversationHistory,
    { role: "user", content: userPrompt }
  ];

  console.log('Asking Llama for decision...');

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: fullPrompt,
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.message.content.trim();

    console.log('Llama response:', aiResponse);

    // Add this exchange to conversation history
    botState.conversationHistory.push(
        { role: "user", content: userPrompt },
        { role: "assistant", content: aiResponse }
    );

    // Extract the action from the response
    const actions = [
      'MOVE_FORWARD', 'MOVE_BACKWARD', 'TURN_LEFT', 'TURN_RIGHT',
      'JUMP', 'ATTACK', 'MINE', 'PLACE', 'CRAFT', 'COLLECT'
    ];

    let chosenAction = null;
    for (const action of actions) {
      if (aiResponse.includes(action)) {
        chosenAction = action;
        break;
      }
    }

    return chosenAction || 'MOVE_FORWARD'; // Default to moving forward if no action detected
  } catch (error) {
    console.error('Error getting AI decision:', error);
    return 'MOVE_FORWARD'; // Default fallback
  }
}

// Execute the action
async function executeAction(action) {
  botState.lastAction = action;
  console.log(`Executing action: ${action}`);

  switch (action) {
    case 'MOVE_FORWARD':
      bot.setControlState('forward', true);
      setTimeout(() => bot.setControlState('forward', false), 1000);
      break;
    case 'MOVE_BACKWARD':
      bot.setControlState('back', true);
      setTimeout(() => bot.setControlState('back', false), 1000);
      break;
    case 'TURN_LEFT':
      bot.setControlState('left', true);
      setTimeout(() => bot.setControlState('left', false), 500);
      break;
    case 'TURN_RIGHT':
      bot.setControlState('right', true);
      setTimeout(() => bot.setControlState('right', false), 500);
      break;
    case 'JUMP':
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 500);
      break;
    case 'ATTACK':
      const entity = bot.nearestEntity(e => e.type === 'mob');
      if (entity) {
        bot.lookAt(entity.position);
        bot.attack(entity);
      }
      break;
    case 'MINE':
      const block = bot.blockAtCursor(4);
      if (block && block.name !== 'air') {
        try {
          await bot.dig(block);
        } catch (err) {
          console.log('Could not mine block:', err.message);
        }
      }
      break;
    case 'PLACE':
      const referenceBlock = bot.blockAtCursor(4);
      if (referenceBlock) {
        const item = bot.inventory.items().find(item =>
            item.name.includes('block') ||
            item.name.includes('log') ||
            item.name.includes('planks')
        );
        if (item) {
          try {
            await bot.equip(item, 'hand');
            const faces = [
              { x: 0, y: 1, z: 0 }, // up
              { x: 0, y: -1, z: 0 }, // down
              { x: 1, y: 0, z: 0 }, // east
              { x: -1, y: 0, z: 0 }, // west
              { x: 0, y: 0, z: 1 }, // south
              { x: 0, y: 0, z: -1 } // north
            ];

            for (const face of faces) {
              try {
                await bot.placeBlock(referenceBlock, face);
                break;
              } catch (err) {
                continue;
              }
            }
          } catch (err) {
            console.log('Could not place block:', err.message);
          }
        }
      }
      break;
    case 'COLLECT':
      const item = bot.nearestEntity(e => e.name === 'item');
      if (item) {
        try {
          const defaultMove = new Movements(bot);
          bot.pathfinder.setMovements(defaultMove);
          await bot.pathfinder.goto(bot.pathfinder.createGoal.GoalNear(item.position.x, item.position.y, item.position.z, 1));
        } catch (err) {
          console.log('Could not path to item:', err.message);
        }
      }
      break;
    case 'CRAFT':
      // Simplified crafting - would need expansion for real use
      console.log('Crafting not fully implemented in this demo');
      break;
    default:
      console.log('Unknown action:', action);
  }

  // Update state after action
  updateBotState();
}

// Bot event handlers
bot.on('spawn', () => {
  console.log('Bot spawned in the world!');
  console.log(`Position: ${bot.entity.position}`);

  // Start the AI decision loop
  updateBotState();
  // Only start AI loop if not controlled by UI
  // aiDecisionLoop();
});

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  console.log(`[CHAT] ${username}: ${message}`);

  // Send chat message to UI
  sendToElectron({
    type: 'chat',
    username: username,
    message: message
  });

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: "system",
            content: `You are LlamaBot, a Minecraft player. You can:
            - Move: MOVE_FORWARD, MOVE_BACKWARD, TURN_LEFT, TURN_RIGHT, JUMP
            - Fight: ATTACK (playername) to attack specific players
            - Interact: MINE blocks, PLACE blocks, COLLECT items
            - Craft items
            
            Respond conversationally but include action commands in parentheses.
            Example responses:
            - "Let me fight that player! (ATTACK steve)"
            - "I'll get those items! (COLLECT)"
            - "Coming to help! (MOVE_FORWARD)"`
          },
          ...botState.conversationHistory,
          { role: "user", content: message }
        ],
        stream: false
      }),
    });

    const data = await response.json();
    let aiResponse = data.message.content.trim();

    // Add this exchange to conversation history
    botState.conversationHistory.push(
        { role: "user", content: message },
        { role: "assistant", content: aiResponse }
    );

    // Keep only last 10 messages for context
    if (botState.conversationHistory.length > 10) {
      botState.conversationHistory = botState.conversationHistory.slice(-10);
    }

    // Handle response and actions
    const actionMatch = aiResponse.match(/\((.*?)\)/);
    if (actionMatch) {
      const action = actionMatch[1];
      aiResponse = aiResponse.replace(/\(.*?\)/, '').trim();
      bot.chat(aiResponse);
      console.log(`[BOT] Chat: ${aiResponse}`);
      console.log(`[BOT] Executing action: ${action}`);
      if (message.toLowerCase() === 'come to me') {
        const player = this.bot.players[username];

        if (!player || !player.entity) {
          this.bot.chat("I can't see you!");
          return;
        }

        this.bot.chat(`Coming to you, ${username}!`);

        // Move to the player
        this.bot.pathfinder.goto(
            new this.bot.pathfinder.goals.GoalNear(
                player.entity.position.x,
                player.entity.position.y,
                player.entity.position.z,
                1
            )
        );
      }

      if (action.startsWith('ATTACK ')) {
        const targetPlayer = action.split(' ')[1];
        const player = bot.players[targetPlayer]?.entity;
        if (player) {
          bot.pvp.attack(player);
        }
      } else {
        await executeAction(action);
      }
    } else {
      bot.chat(aiResponse);
      console.log(`[BOT] Chat: ${aiResponse}`);
    }

  } catch (error) {
    console.error('[ERROR] Ollama chat error:', error);
  }
});

bot.on('entityHurt', (entity) => {
  if (entity === bot.entity) {
    const attacker = bot.nearestEntity(e => (e.type === 'player' || e.type === 'mob') && e !== bot.entity);
    if (attacker) {
      if (attacker.type === 'mob') {
        bot.chat(`Time to eliminate this ${attacker.name}!`);
        bot.pvp.attack(attacker);
      } else if (attacker.type === 'player') {
        if (!botState.hasNotifiedCombat || botState.lastAttacker !== attacker.username) {
          bot.chat(`You'll regret attacking me, ${attacker.username}!`);
          botState.hasNotifiedCombat = true;
          botState.lastAttacker = attacker.username;
        }
        bot.pvp.attack(attacker);
      }

      const defaultMove = new Movements(bot);
      bot.pathfinder.setMovements(defaultMove);
      bot.lookAt(attacker.position);
      bot.setControlState('forward', true);

      setTimeout(() => {
        bot.setControlState('forward', false);
      }, 30000);
    }
  }
});

bot.on('death', () => {
  bot.chat("Oh no, I died!");
  // Reset combat state
  botState.hasNotifiedCombat = false;
  botState.lastAttacker = null;

  // Send death notification to UI
  sendToElectron({
    type: 'chat',
    username: 'System',
    message: 'Bot died and will respawn'
  });
});

bot.on('playerDeath', (player) => {
  const deathMessage = player.deathMessage;
  if (deathMessage) {
    let message = '';
    if (deathMessage.includes('drowned')) {
      message = `Oh no, ${player.username} drowned!`;
    } else if (deathMessage.includes('fell')) {
      message = `Ouch! ${player.username} fell to their death!`;
    } else if (deathMessage.includes('slain')) {
      message = `Rest in peace ${player.username}, you fought well!`;
    } else {
      message = `Oh no, ${player.username} died!`;
    }
    bot.chat(message);
  }
});

// Listen for health updates
bot.on('health', () => {
  updateBotState();
});

// Listen for inventory updates
bot.on('playerCollect', () => {
  updateBotState();
});

bot.on('kicked', (reason) => {
  console.log('Bot was kicked:', reason);
});

bot.on('error', (err) => {
  console.log('Bot error:', err);
});

// Handle commands from Electron
rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);

    if (message.type === 'command') {
      executeAction(message.data);
    } else if (message.type === 'chat') {
      bot.chat(message.data);
    }
  } catch (err) {
    console.error('Error processing command from UI:', err);
  }
});

console.log('Starting Minecraft bot...');