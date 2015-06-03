var renderer, stage, container, graphics;
var gameSize = 128;
//var zoom = window.innerHeight / (window.innerWidth / gameSize);
var zoom = 80;
var myid;
var socket;
var player;
var players = [];
var bombs = [];
var particles = [];
var textLogs = [];
var mvspd = 4;
var jumpforce = 8;
var ground, wall1, wall2;
var size = 0.23;

var buttons = {
    up : false,
    left : false,
    right : false,
    fire : false,
    respawn : false,
};

var body, pid;
var curState, oldState;
var inputs = [];
var pos = {x:0, y:0};
var seqNumber;
var pendingInputs;
var world;
var isDead;
var kills;
var deaths;

var myPlayer;
var plane = null;

init();
animate();

var ttl;
var Particles = function(x, y, vel, col, ttl) {
    var colors = [0xFF0000, 0xFFFF00, 0xFF3300, 0xFFCC00, 0xCC0000];

    var particle = new p2.Particle();
    this.ttl = ttl;

    this.body = new p2.Body({
        mass: 2.5,
        position: [0, y],
        velocity: [vel.x , vel.y],
    });

    this.body.addShape(particle);
    this.body.damping = 0;
    world.addBody(this.body);

    this.graphics = new PIXI.Graphics();
    this.graphics.beginFill(colors[col]);
    this.graphics.drawRect(x, this.body[1], 0.05, 0.05);
    container.addChild(this.graphics);
};

Particles.prototype.destroy = function (id) {
    world.removeBody(this.body);
    container.removeChild(this.graphics);
    particles.slice(id, 1);
};

var Ground = function() {
    var planeShape = new p2.Plane();
    var plane = new p2.Body({
        position:[0,-1],
    });

    plane.addShape(planeShape);
    world.addBody(plane);

    this.graphics = new PIXI.Graphics();
    this.graphics.beginFill(0xFFFFFF);
    this.graphics.drawRect(-100, -1, 500, -100);
    container.addChild(this.graphics);
};

var Platform = function(sizeX, sizeY, posX, posY) {
    var rectangle = new p2.Rectangle(sizeX, sizeY);
    this.body = new p2.Body({
        mass: 0,
        position: [posX,posY],
    });

    this.body.addShape(rectangle);
    this.body.type = p2.Body.KINEMATIC;
    world.addBody(this.body);

    this.graphics = new PIXI.Graphics();
    this.graphics.beginFill(0xFFFFFF);
    this.graphics.drawRect(posX - sizeX/2, posY - sizeY/2, rectangle.width, rectangle.height);
    container.addChild(this.graphics);
};

var Bomb = function(pos) {
    var circle = new p2.Circle(size/2);

    var opts = {
	mass: 5,
	position: [pos.x, pos.y],
    };

    this.curState = {pos:{x:0,y:0}};
    this.oldState = {pos:{x:0,y:0}};

    this.body = new p2.Body(opts);
    this.body.addShape(circle);
    this.body.fixedRotation = false;
    this.body.damping = 0;
    this.body.gravityScale = 0.8;
    //world.addBody(this.body);

    this.graphics = new PIXI.Graphics();
    this.graphics.beginFill(0xffffff);
    this.graphics.drawCircle(-circle.width/2, -circle.height/2, size/2);
    container.addChild(this.graphics);
};

Bomb.prototype.destroy = function(id) {
    world.removeBody(this.body);
    container.removeChild(this.graphics);
    bombs.splice(id, 1);
};

var color;
var Player = function(id, col) {
    console.log("CREATED ANOTHER PLAYER");
    var rectangle= new p2.Rectangle(size,size);
    this.pid = id;
    this.isDead = false;
    this.color = col;
    this.kills = 0;
    this.deaths = 0;
    this.lerpPercentage = 0;

    var opts = {
	mass: 1,
	position: [0,-0.5],
	//type: p2.Body.STATIC,
    };

    this.seqNumber = 0;
    this.pendingInputs = [];
    this.curState = {x:0,y:0, vel:{x: 0, y:0}, lastUpdate: Date.now()};
    this.oldState = {x:0,y:0, vel:{x: 0, y: 0}, lastUpdate: Date.now()};

    this.body = new p2.Body(opts);
    this.body.addShape(rectangle);
    this.body.fixedRotation = true;
    this.body.damping = 0.9;
    world.addBody(this.body);

    this.graphics = new PIXI.Graphics();
    this.graphics.beginFill("0x" + col);
    this.graphics.drawRect(-rectangle.width/2, -rectangle.height/2, rectangle.width, rectangle.height);
    container.addChild(this.graphics);
};

Player.prototype.processInputs = function() {
    
    var input = {
        fire: false,
	right: false,
	left: false,
	up: false,
	respawn: false,
    };

    if(buttons.fire)
    	input.fire = true;

    if(buttons.up)
        input.up = true;

    if(buttons.left)
        input.left = true;

    if(buttons.right)
        input.right = true;

    if(this.isDead && buttons.respawn)
        input.respawn = true;

    for(i in input) {
        if(input[i])
	{
            input.seqNumber = this.seqNumber++;
            input.pid = this.pid;
            socket.emit('move', input);
            this.applyInput(input);
            this.pendingInputs.push(input);
        } 
    }
};

Player.prototype.applyInput = function(input) {
    if(input.up && checkIfCanJump())
	this.body.velocity[1] = jumpforce;

    if(input.right)
        this.body.velocity[0] = mvspd;
    else if(input.left)
        this.body.velocity[0] = -mvspd;
    else
        return;
};

Player.prototype.respawn = function() {
    this.isDead = false;
    world.addBody(this.body);
    container.addChild(this.graphics);
};

Player.prototype.destroy = function() {
    world.removeBody(this.body);
    container.removeChild(this.graphics);
    this.isDead = true;
};

var now; 
var lerpPercentage;
Player.prototype.applyState = function(state) {
    this.kills = state.kills;
    this.deaths = state.deaths;


    this.curState.x = state.position.x;
    this.curState.y = state.position.y;
    this.curState.lastUpdate = state.lastUpdate;

    //console.log("now: " + now);
    //console.log("portion: " + portion);
    //console.log("total: " + total);
    //console.log("ratio: " +ratio);


    this.oldState.lastUpdate = Date.now();
    this.oldState.x = this.curState.x;
    this.oldState.y = this.curState.y;

    //this.body.position[0] = this.curState.x;
    //this.body.position[1] = this.curState.y;
};


Player.prototype.fire = function() {
    var pos = {
        x: this.body.position[0],
	y: this.body.position[1],
    };

    if(bombs[this.pid] == null)
        bombs[this.pid] = new Bomb(pos); 
    else
        return;
};


function init(){
    socket = io.connect('http://178.62.196.153:5000');

    world = new p2.World({
        gravity: [0,-15] 
    });

    world.islandSplit = true;
    world.sleepMode = p2.World.ISLAND_SLEEPING;
    world.solver.iterations = 20;
    world.solver.tolerance = 0.0001;
    world.defaultContactMaterial.friction = 1;
    world.defaultContactMaterial.restitution = 0.6;

    onConnected();
    receiveState();
    userConnected();
    userFired();
    onExplosion();
    onDestroyed();
    onRespawn();
    userDisconnected();

    renderer = PIXI.autoDetectRenderer(window.innerWidth, window.innerHeight),
    stage = new PIXI.Stage(0x202020);

    container = new PIXI.DisplayObjectContainer(),
    stage.addChild(container);

    document.body.appendChild(renderer.view);

    container.position.x = renderer.width/2;
    container.position.y = renderer.height/2;
    container.scale.x = zoom;
    container.scale.y = -zoom;
}

function onConnected() {
    socket.on('onconnected', function(pid, list) {
        myid = pid.pid;

        for(var i in pid.list) {
            var n = pid.list[i];
	    if(n.id != null) {
	        players[n.id] = new Player(n.id, n.color);

		if(myid === n.id) {
		    myPlayer = players[n.id];
                    drawText(n.color, "#000000", n.id,"CONNECTED", "");
           	}
	    }
        }          
	    ground = new Ground();
	    var plat;
	    var roof;
	    plat = new Platform(3, 0.1, -4, -0.5);
	    plat = new Platform(3, 0.1, 4, -0.5);
	    plat = new Platform(3, 0.5, -4, 1);
	    plat = new Platform(3, 0.5, 4, 1);
	    plat = new Platform(1.5, 0.1, -4, 2);
	    plat = new Platform(0.5, 1, -4, 2.5);
	    plat = new Platform(1.5, 0.1, 4, 2);
	    plat = new Platform(0.5, 1, 4, 2.5);
	    plat = new Platform(3, 0.5, 0, 0);
	    plat = new Platform(1, 0.5, 1.5, 0.5);
	    plat = new Platform(1, 0.5, -7, 0.25);
	    plat = new Platform(1, 0.5, 7, 0.25);
	    plat = new Platform(1.5, 0.1, -0.5, 1);
	    plat = new Platform(0.5, 1, 0, 1.5);
	    roof = new Platform(16, 1, 0, 5);
	    wall1 = new Platform(1, 25, -8, -1);
	    wall2 = new Platform(1, 25, 8, -1);


    });
}

function userConnected() {
    socket.on('newconnected', function(player) {
        drawText(player.color, "#000000", player.id,"CONNECTED", "");
        players[player.id] = new Player(player.id, player.color);
    });
}

function receiveState() {
    socket.on('moved', function(state) {
        for(var i in state) {
	    var p = state[i];
	    if(players[p.id] == myPlayer) {

	        myPlayer.body.position[0] = p.position.x;
	        myPlayer.body.position[1] = p.position.y;
		var j = 0;
		while(j < myPlayer.pendingInputs.length) {
		    var input = myPlayer.pendingInputs[j];
		    if(input.seqNumber <= p.lastProcessedInput) {
		        myPlayer.pendingInputs.splice(j,1);
		    }
		    else {
		        myPlayer.applyInput(input);
			j++;
		    }
		}
	    }
	    else if(players[p.id] != null) {
	        players[p.id].applyState(p);
	    }

	    if(bombs[p.id] != null && p.bomb != null) {
	        bombs[p.id].body.position[0] = p.bomb.x;
	        bombs[p.id].body.position[1] = p.bomb.y;
	    }
	}
    });
}

function userDisconnected() {
    socket.on('dc', function(pid) {
        if(players[pid] != null) {
            drawText(players[pid].color, "#000000", pid, "DISCONNECTED","");
            players.splice(pid, 1);
	    players[pid].destroy();
	}
    });
}

function userFired() {
    socket.on('fired', function(data) {
        bombs[data.id] = new Bomb(data.bomb); 
    });
}

function onExplosion() {
    socket.on('exploded', function(id) {
        if(bombs[id] != null) {
	    var x = bombs[id].body.position[0];
	    var y = bombs[id].body.position[1];
	    for(var i = 0; i < 50; i++) {
                var randX = Math.floor((Math.random() * (8 - (-8) + 1) ) + (-8)); 
                var randColor = Math.floor((Math.random() * (4 - (1) + 1) ) + (1)); 
		var vel = {x: randX, y: i/2};
	        particles.push(new Particles(x, y, vel, randColor, 0.5));
	    }
	    bombs[id].destroy(id);
	}

    });
}

function onDestroyed() {
    socket.on('destroyed', function(data) {
        if(players[data.id] != null && !players[data.id].isDead) {
	    var x = players[data.id].body.position[0];
	    var y = players[data.id].body.position[1];
	    for(var i = 0; i < 15; i++) {
                var randX = Math.floor((Math.random() * (2 - (-2) + 1) ) + (-2)); 
		var vel = {x: randX, y: i/5};
	        particles.push(new Particles(x, y, vel, 0, 10));
	    }
	    players[data.id].destroy();
	    if(data.id === data.destroyerId)
                drawText(players[data.id].color, players[data.destroyerId].color, "PLAYER", "COMMITTED SUICIDE", "");
	    else
                drawText(players[data.destroyerId].color, players[data.id].color, "PLAYER", "KILLED", "PLAYER");
	 }
    });
}

function onRespawn() {
    socket.on('respawned', function(data) {
        if(players[data] != null && players[data].isDead) {
	    players[data].respawn();
	}
    });
}

function updateParticles(delta) {
     for(var i in particles) {
         if(particles[i].ttl <= 0)
	     particles[i].destroy(i);
	 else
	     particles[i].ttl -= delta;
     }
}


var timeStep = 1 / 60; // seconds 

function animate(t) {
    t = t || 0;
    now = Date.now();

    requestAnimationFrame(animate);

    if(myPlayer != null)
        myPlayer.processInputs();

    world.step(timeStep);
    updateParticles(timeStep);
    moveText(timeStep);
    //drawScoreBoard();

    for(var i in players) {
    	if(players[i] != null) {
	    var p = players[i];
            players[i].graphics.position.x = players[i].body.position[0];
            players[i].graphics.position.y = players[i].body.position[1];
            players[i].graphics.rotation = players[i].body.angle;

	    if(p.pid != myPlayer.pid) {
	    var total = p.curState.lastUpdate - p.oldState.lastUpdate;
	    var tickRate = 1000 / 64;
	    var portion = (now - tickRate) - p.oldState.lastUpdate;
	    p.lerpPercentage = portion / total;

	    p.body.velocity[0] = lerp(p.oldState.vel.x, p.curState.vel.x, p.lerpPercentage);
	    p.body.velocity[1] = lerp(p.oldState.vel.y, p.curState.vel.y, p.lerpPercentage);
	    
	    p.body.position[0] = lerp(p.oldState.x, p.curState.x, p.lerpPercentage);
	    p.body.position[1] = lerp(p.oldState.y, p.curState.y, p.lerpPercentage);
	    }
	}
    }

    for(var i in bombs) {
    	if(bombs[i] != null) {
            bombs[i].graphics.position.x = bombs[i].body.position[0];
            bombs[i].graphics.position.y = bombs[i].body.position[1];
            bombs[i].graphics.rotation = bombs[i].body.angle;
	}
    }

    for(var i in particles) {
    	if(particles[i] != null) {
            particles[i].graphics.position.x = particles[i].body.position[0];
            particles[i].graphics.position.y = particles[i].body.position[1];
        }
    }
    renderer.render(stage);
}
var yAxis = p2.vec2.fromValues(0,1);

function checkIfCanJump(){
    var result = false;
    for(var i=0; i<world.narrowphase.contactEquations.length; i++){
        var c = world.narrowphase.contactEquations[i];
        if(c.bodyA === myPlayer.body || c.bodyB === myPlayer.body){
            var d = p2.vec2.dot(c.normalA, yAxis); // Normal dot Y-axis
            if(c.bodyA === myPlayer.body) d *= -1;
                if(d > 0.1) result = true;
        }
    }
    return result;
}
   // (4.22208334636).fixed(n) will return fixed point value to n places, default n = 3
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };

function lerp (p, n, t) { 
var _t = Number(t); 
_t = (Math.max(0, Math.min(1, _t))).fixed(); 
return (p + _t * (n - p)).fixed(); 
}

window.onkeydown = function(event){
switch(event.keyCode){
    case 38: // up
    case 87: // up
	    buttons.up = true;
    break;
    case 39: // right
    case 68: // right
    buttons.right = true;
    break;
    case 37: // left
    case 65: // left
    buttons.left = true;
    break;
    case 32: // space
    buttons.fire = true;
    break;
    case 82: //r 
    buttons.respawn = true;
}
};

window.onkeyup = function(event){
switch(event.keyCode){
    case 38: // up
    case 87: // up
    buttons.up = false;
    break;
    case 39: // right
    case 68: // right
    buttons.right = false;
    break;
    case 37: // left
    case 65: // left
    buttons.left = false;
    break;
    case 32: // space
    buttons.fire = false;
    break;
    case 82: //r
    buttons.respawn = false;
}
};

var x = window.innerWidth/25;
var y = window.innerHeight - window.innerHeight/4;

var lastTextHeight;
var ttl;

function drawText(firstColor, thirdColor, firstText, secondText, thirdText) {

    if(textLogs.length != 0)
        lastTextHeight = textLogs[textLogs.length-1].first.position.y;
    else
        lastTextHeight = y;

    var first;
    var second;
    var third;

    var text = new PIXI.Text("", {font:"12px Arial", fill:"#000000"});
    text.first = new PIXI.Text(firstText, {font:"20px Arial", fill:"#" + firstColor, stroke: "#e1e1e1", strokeThickness: 3});
    text.second = new PIXI.Text(secondText, {font:"20px Arial", fill:"#000000", stroke:"#e1e1e1", strokeThickness: 5});
    text.third = new PIXI.Text(thirdText, {font:"20px Arial", fill:"#" + thirdColor, stroke:"#e1e1e1", strokeThickness: 3});

    text.ttl = 5;
    var offSet = 25;
    var posY;

    text.position.x = x;

    if(lastTextHeight >= y + offSet)
        posY = y;
    else
        posY = lastTextHeight - offSet;

    text.first.position.y = posY;
    text.second.position.y = posY;
    text.third.position.y = posY;

    text.first.position.x = x;
    text.second.position.x = text.first.position.x + (offSet * 15);
    text.third.position.x = text.second.position.x + (offSet * 5);

    stage.addChild(text.first);
    stage.addChild(text.second);
    stage.addChild(text.third);
    textLogs.push(text);
}

function moveText(delta) {

    var scrollSpeed = 35;
    for(var i in textLogs) {
        var t = textLogs[i];
	if(t.ttl <= 0) {
	    stage.removeChild(t.first); 
	    stage.removeChild(t.second); 
	    stage.removeChild(t.third); 
	    t.first.destroy();
	    t.second.destroy();
	    t.third.destroy();
	    textLogs.splice(i, 1);
	}else 
	    t.ttl -= delta;

	t.first.position.y += delta * scrollSpeed;
	t.second.position.y += delta * scrollSpeed;
	t.third.position.y += delta * scrollSpeed;
    }
}

function drawScoreBoard() {
    var k;
    var d;
    var p;

    var posX = window.innerWidth - window.innerWidth/5;
    var posY = window.innerHeight - window.innerHeight/2.5;

    var textOffSet = 35;
    var lastY = posY;


    for(var i in players) {
	p = players[i];
        k = p.kills;
        d = p.deaths;

        var player = new PIXI.Text("P" , {font:"16px Arial", fill: "#000000"});
        var kills = new PIXI.Text("" , {font:"15px Arial", fill:"#FFFFFF"});
        var deaths = new PIXI.Text("" , {font:"15px Arial", fill:"#000000"});

	player.setStyle({fill:"#" + p.color, stroke: "#e1e1e1", strokeThickness: 1});
	kills.setStyle({fill:"#000000", stroke: "#e1e1e1", strokeThickness: 2});
	deaths.setStyle({fill:"#000000", stroke: "#e1e1e1", strokeThickness: 2});

	kills.setText(k);
	deaths.setText(d);

	player.position.x = posX;
        player.position.y = lastY + textOffSet;

        kills.position.x = posX + textOffSet;
        kills.position.y = lastY + textOffSet;

        deaths.position.x = kills.position.x + textOffSet;
        deaths.position.y = lastY + textOffSet;
	
	lastY = kills.position.y;

        stage.addChild(player);
        stage.addChild(kills);
        stage.addChild(deaths);
    }
}
