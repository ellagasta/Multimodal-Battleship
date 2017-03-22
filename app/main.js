// GAME SETUP
var initialState = SKIPSETUP ? "playing" : "setup";
var gameState = new GameState({state: initialState});
var cpuBoard = new Board({autoDeploy: true, name: "cpu"});
var playerBoard = new Board({autoDeploy: SKIPSETUP, name: "player"});
var cursor = new Cursor();

// UI SETUP
setupUserInterface();

// selectedTile: The tile that the player is currently hovering above
var selectedTile = false;

// grabbedShip/Offset: The ship and offset if player is currently manipulating a ship
var grabbedShip = false;
var grabbedOffset = [0, 0];
var grabbedRollOffset = 0;
var lastRoll = 0;
// isGrabbing: Is the player's hand currently in a grabbing pose
var isGrabbing = false;

// hasCheated: Has the player cheated before
var hasCheated = false;
// cheatingPenalty: Is the player being punished for multiple cheating instances
var cheatingPenalty = false;

// cursorPosition initial param for filtering
var cursorPosition = [0, 0, 0];

// MAIN GAME LOOP
// Called every time the Leap provides a new frame of data
Leap.loop({ hand: function(hand) {
  // Clear any highlighting at the beginning of the loop
  unhighlightTiles();

  // 4.1, Moving the cursor with Leap data
  // Use the hand data to control the cursor's screen position
  var leapPosition = hand.screenPosition();
  var y_offset = 300;
  var roll = (lastRoll + hand.roll())/2.0;

  var newCursorPosition = [leapPosition[0], leapPosition[1] + y_offset, leapPosition[2]]; // offset y coordinate
  // very simple filter to smooth wiggle
  cursorPosition = [(cursorPosition[0] + newCursorPosition[0])/2, (cursorPosition[1] + newCursorPosition[1])/2, (cursorPosition[2] + newCursorPosition[2])/2];
  cursor.setScreenPosition(cursorPosition);

  // 4.1
  // Get the tile that the player is currently selecting, and highlight it
  selectedTile = getIntersectingTile(cursorPosition);
  if (selectedTile) {
    highlightTile(selectedTile, '#fafafa'); // highlight with very light grey
  }

  // SETUP mode
  if (gameState.get('state') == 'setup') {
    background.setContent("<h1>battleship</h1><h3 style='color: #7CD3A2;'>deploy ships</h3>");
    // TODO: 4.2, Deploying ships
    //  Enable the player to grab, move, rotate, and drop ships to deploy them

    // First, determine if grabbing pose or not
    var grabThreshold = 0.85; // num between 0 and 1 representing fist resemblance
    isGrabbing = hand.grabStrength > grabThreshold;

    // Grabbing, but no selected ship yet. Look for one.
    // Update grabbedShip/grabbedOffset if the user is hovering over a ship
    if (!grabbedShip && isGrabbing) {
      var info = getIntersectingShipAndOffset(cursorPosition);
      if (info) {
        grabbedShip = info.ship;
        grabbedOffset = info.offset;
	      grabbedRollOffset = roll;
        console.log(grabbedShip);
        console.log(grabbedOffset);
        console.log(cursorPosition);
      }
    }

    // Has selected a ship and is still holding it
    // Move the ship
    else if (grabbedShip && isGrabbing) {
      var newX = cursorPosition[0] - grabbedOffset[0];
      var newY = cursorPosition[1] - grabbedOffset[1];
      grabbedShip.setScreenPosition([newX,newY]);
      grabbedShip.setScreenRotation(2.0*(roll - grabbedRollOffset));
    }

    // Finished moving a ship. Release it, and try placing it.
    // Try placing the ship on the board and release the ship
    else if (grabbedShip && !isGrabbing) {
      placeShip(grabbedShip);
      grabbedShip = false;
    }
  }

  // PLAYING or END GAME so draw the board and ships (if player's board)
  // Note: Don't have to touch this code
  else {
    if (gameState.get('state') == 'playing') {
      background.setContent("<h1>battleship</h1><h3 style='color: #7CD3A2;'>game on</h3>");
      turnFeedback.setContent(gameState.getTurnHTML());
    }
    else if (gameState.get('state') == 'end') {
      var endLabel = gameState.get('winner') == 'player' ? 'you won!' : 'game over';
      background.setContent("<h1>battleship</h1><h3 style='color: #7CD3A2;'>"+endLabel+"</h3>");
      turnFeedback.setContent("");
    }

    var board = gameState.get('turn') == 'player' ? cpuBoard : playerBoard;
    // Render past shots
    board.get('shots').forEach(function(shot) {
      var position = shot.get('position');
      var tileColor = shot.get('isHit') ? Colors.RED : Colors.YELLOW;
      highlightTile(position, tileColor);
    });

    // Render the ships
    playerBoard.get('ships').forEach(function(ship) {
      if (gameState.get('turn') == 'cpu') {
        var position = ship.get('position');
        var screenPosition = gridOrigin.slice(0);
        screenPosition[0] += position.col * TILESIZE;
        screenPosition[1] += position.row * TILESIZE;
        ship.setScreenPosition(screenPosition);
        if (ship.get('isVertical'))
          ship.setScreenRotation(Math.PI/2);
      } else {
        ship.setScreenPosition([-500, -500]);
      }
    });

    // If playing and CPU's turn, generate a shot
    if (gameState.get('state') == 'playing' && gameState.isCpuTurn() && !gameState.get('waiting')) {
      gameState.set('waiting', true);
      generateCpuShot();
    }
  }
  lastRoll = hand.roll();
}}).use('screenPosition', {positioning: 'absolute', scale: LEAPSCALE});

// processSpeech(transcript)
//  Is called anytime speech is recognized by the Web Speech API
// Input:
//    transcript, a string of possibly multiple words that were recognized
// Output:
//    processed, a boolean indicating whether the system reacted to the speech or not
var processSpeech = function(transcript) {
  // Helper function to detect if any commands appear in a string
  var userSaid = function(str, commands) {
    str = str.toLowerCase();
    for (var i = 0; i < commands.length; i++) {
      var testWord = commands[i].toLowerCase();
      if (str.indexOf(testWord) > -1)
        return true;
    }
    return false;
  };

  var processed = false;
  if (gameState.get('state') == 'setup') {
    // 4.3, Starting the game with speech
    // Detect the 'start' command, and start the game if it was said
    if (userSaid(transcript, ['start'])) {
      gameState.startGame();
      processed = true;
    }

    // place battleship on voice command at selected tile
    if (userSaid(transcript, ['battleship', 'battle', 'ship'])) {
      var battleship = getBattleship(playerBoard);
      if (userSaid(transcript, ['rotate']) && battleship.get('isDeployed')) {
        var rotated = battleship.get('isVertical');
        if (rotated) {
          battleship.set('screenRotation', 0);
        } else {
          battleship.set('screenRotation', Math.PI/2);
        }
        vocallyPlaceShip(battleship, battleship.get('position'));
      } else {
        vocallyPlaceShip(battleship, selectedTile);
      }
    }

    // place patrol boat on voice command at selected tile
    if (userSaid(transcript, ['patrol boat', 'patrol', 'boat'])) {
      var boat = getPatrolBoat(playerBoard);
      if (userSaid(transcript, ['rotate']) && boat.get('isDeployed')) {
        var rotated = boat.get('isVertical');
        if (rotated) {
          boat.set('screenRotation', 0);
        } else {
          boat.set('screenRotation', Math.PI/2);
        }
        vocallyPlaceShip(boat, boat.get('position'));
      } else {
        vocallyPlaceShip(boat, selectedTile);
      }
    }
  }

  else if (gameState.get('state') == 'playing') {
    if (gameState.isPlayerTurn()) {
      // 4.4, Player's turn
      // Detect the 'fire' command, and register the shot if it was said
      if (userSaid(transcript, ['fire'])) {
        registerPlayerShot();

        processed = true;
      }
    }

    else if (gameState.isCpuTurn() && gameState.waitingForPlayer()) {
      // TODO: 4.5, CPU's turn
      // Detect the player's response to the CPU's shot: hit, miss, you sunk my ..., game over
      // and register the CPU's shot if it was said
      var response;
      if (userSaid(transcript, ['hit'])) {
        response = "hit";
        processed = true;
      } else if (userSaid(transcript, ['miss'])) {
        response = "miss";
        processed = true;
      } else if (userSaid(transcript, ['sunk', 'you sunk', 'sunk my'])) {
        response = "sunk";
        processed = true;
      } else if (userSaid(transcript, ['game over', 'game', 'over'])) {
        response = "game over";
        processed = true;
      }
      if (processed) {
        console.log("REGISTERED RESPONSE");
        console.log(response);
        registerCpuShot(response);
      }
    }
  }

  return processed;
};

// 4.4, Player's turn
// Generate CPU speech feedback when player takes a shot
var registerPlayerShot = function() {
  // CPU should respond if the shot was off-board

  if (!selectedTile) {
    generateSpeech("Select a cell to fire on.");
  }

  // If aiming at a tile, register the player's shot
  else {
    var shot = new Shot({position: selectedTile});
    var result = cpuBoard.fireShot(shot);
    console.log(result);

    // Duplicate shot
    if (!result) return;

    // Generate CPU feedback in three cases
    // Game over
    if (result.isGameOver) {
      var shipName = result.sunkShip.get('type');
      var msg = "You sunk my " + shipName + ". Game Over";
      generateSpeech(msg);
      gameState.endGame("player");
      return;
    }
    // Sunk ship
    else if (result.sunkShip) {
      var shipName = result.sunkShip.get('type');
      var msg = "You sunk my " + shipName;
      generateSpeech(msg);
    }
    // Hit or miss
    else {
      var isHit = result.shot.get('isHit');
      if (isHit) {
        generateSpeech("Hit");
      } else {
        generateSpeech("Miss");
      }
    }

    if (!result.isGameOver) {
      // Uncomment nextTurn to move onto the CPU's turn
      nextTurn();
    }
  }
};

// 4.5, CPU's turn
// Generate CPU shot as speech and blinking
var cpuShot;
var generateCpuShot = function() {
  // Generate a random CPU shot
  cpuShot = gameState.getCpuShot();
  var tile = cpuShot.get('position');
  var rowName = ROWNAMES[tile.row]; // e.g. "A"
  var colName = COLNAMES[tile.col]; // e.g. "5"

  // Generate speech and visual cues for CPU shot
  generateSpeech("Fire" + rowName + colName);
  blinkTile(tile);
};

// TODO: 4.5, CPU's turn
// Generate CPU speech in response to the player's response
// E.g. CPU takes shot, then player responds with "hit" ==> CPU could then say "AWESOME!"
var registerCpuShot = function(playerResponse) {
  // Cancel any blinking
  unblinkTiles();
  var result = playerBoard.fireShot(cpuShot);

  // NOTE: Here we are using the actual result of the shot, rather than the player's response
  // In 4.6, you may experiment with the CPU's response when the player is not being truthful!

  // TODO: Generate CPU feedback in three cases
  // Game over
  if (!isPlayerTruthful(playerResponse, result)){
    if (hasCheated) {
      if (!cheatingPenalty){
        generateSpeech("Alright, that's it. No more moves for you!");
        cheatingPenalty = true;
      }
    } else {
      generateSpeech("You're cheating. I can tell. I won't let you off next time");
      hasCheated = true;
    }
  }
  if (result.isGameOver) {
    generateSpeech("I Win!");
    gameState.endGame("cpu");
    return;
  }
  // Sunk ship
  else if (result.sunkShip) {
    generateSpeech("One more left!");
    var shipName = result.sunkShip.get('type');
  }
  // Hit or miss
  else {
    var isHit = result.shot.get('isHit');
    if (isHit) {
      generateSpeech("Got you!");
    } else {
      generateSpeech("Drat, you're safe this time.");
    }
  }

  if (!result.isGameOver) {
    // TODO: Uncomment nextTurn to move onto the player's next turn
    nextTurn();
    if (cheatingPenalty) {
      nextTurn();
    }
  }
};
