var renderer, stage, container, graphics;
var zoom = 65;
var p;
var myid;
var socket;
var player;
var players = [];
var bombs = [];
var particles = [];
var mvspd = 4;
var jumpforce = 8;
var ground, plat1, plat2, plat3, plat4, plat5, plat6, plat7, plat8, plat9, wall1, wall2;
var size = 0.23,
    dist = size * 2;

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
    //this.body.allowSleep = false;
    //this.body.type = p2.Body.AWAKE;
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
    //this.graphics.drawRect(posX, posY, rectangle.width, rectangle.height);
    this.graphics.drawRect(posX - sizeX/2, posY, rectangle.width, rectangle.height);
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

var Player = function(id) {
    console.log("CREATED ANOTHER PLAYER");
    var rectangle= new p2.Rectangle(size,size);
    this.pid = id;
    this.isDead = false;

    var opts = {
	mass: 1,
	position: [0,1],
    };

    this.seqNumber = 0;
    this.pendingInputs = [];
    this.curState = {pos:{x:0,y:0}};
    this.oldState = {pos:{x:0,y:0}};

    this.body = new p2.Body(opts);
    this.body.addShape(rectangle);
    this.body.fixedRotation = true;
    this.body.damping = 0.9;
    world.addBody(this.body);

    this.graphics = new PIXI.Graphics();
    this.graphics.beginFill(0xff5555);
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

    input.seqNumber = this.seqNumber++;
    input.pid = this.pid;
    socket.emit('move', input);
    this.applyInput(input);
    this.pendingInputs.push(input);
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
    world.solver.tolerance = 0.001;
    //world.setGlobalStiffness(1e4);
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

function sendMovement() {
    var data = {
	inputs: buttons,
	id: myid
    };
}

function onConnected() {
    socket.on('onconnected', function(pid, list) {
        myid = pid.pid;
        console.log("CONNECTED");
        console.log("ID: " + myid);

        for(var i in pid.list) {
            var n = pid.list[i];
	    if(n.id != null) {
	        players[n.id] = new Player(n.id);

		if(myid === n.id) {
		    myPlayer = players[n.id];
                    ground = new Ground();
		    plat1 = new Platform(3, 0.1, -4, -0.5);
		    plat2 = new Platform(3, 0.1, 4, -0.5);
		    plat3 = new Platform(3, 0.1, -4, 1);
		    plat4 = new Platform(3, 0.1, 4, 1);
		    plat5 = new Platform(1.5, 0.1, -4, 2);
		    plat6 = new Platform(1.5, 0.1, 4, 2);
		    plat7 = new Platform(3, 0.1, 0, 0);
		    plat8 = new Platform(1, 0.1, 1.7, 0.5);
		    plat9 = new Platform(2, 0.1, -0.3, 1);
		    wall1 = new Platform(1, 15, -5, -1);
		    wall2 = new Platform(1, 15, 5, -1);
	        }
	    }
        }
    });
}

function userConnected() {
    socket.on('newconnected', function(pid) {
        console.log(pid + " CONNECTED");
        players[pid] = new Player(pid);
    });
}

function receiveState() {
    socket.on('moved', function(state) {
        for(var i in state) {
	    var p = state[i];
	    /*if(players[p.id] != null && players[p.id].pid == myPlayer.pid)	{
	        //var j = 0;
		for(var j = 0; j <  myPlayer.pendingInputs.length; j++) {
		    var input = myPlayer.pendingInputs[j];
		    if(input.seqNumber <= p.lastProcessedInput) {
		    	console.log("SPLICING: " + j);
		        myPlayer.pendingInputs.splice(j,1);
			}
		    else {
		    	console.log("APPLYING: " + input.seqNumber);
		        //myPlayer.applyInput(input);
	                myPlayer.body.position[0] = p.position[0];
	                myPlayer.body.position[1] = p.position[1];
		    }
		}*/
	    if(players[p.id] != null) {
	         players[p.id].body.position[0] = p.position.x;
	         players[p.id].body.position[1] = p.position.y;
	         //players[p.id].body.velocity[0] = p.velocity[0];
	    }

	    if(bombs[p.id] != null && p.bomb != null) {
	         bombs[p.id].body.position[0] = p.bomb.x;
	         bombs[p.id].body.position[1] = p.bomb.y;
	    }
	        
	}
	/*if(players[id] != null) {
		players[id].body.velocity[0] = newData[0];
		players[id].body.velocity[1] = newData[1];
	}else
	return*/
    });
}

function userDisconnected() {
    socket.on('dc', function(pid) {
        console.log(pid + " DISCONNECTED");
        if(players[pid] != null) {
            world.removeBody(players[pid].body);
	    container.removeChild(players[pid].graphics);
            players.splice(pid, 1);
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
        if(players[data] != null && !players[data].isDead) {
	    var x = players[data].body.position[0];
	    var y = players[data].body.position[1];
	    for(var i = 0; i < 15; i++) {
                var randX = Math.floor((Math.random() * (2 - (-2) + 1) ) + (-2)); 
		var vel = {x: randX, y: i/5};
	        particles.push(new Particles(x, y, vel, 0, 10));
	    }
	    players[data].destroy();
	 }
    });
}

function onRespawn() {
    socket.on('respawned', function(data) {
        if(players[data] != null) {
	    players[data].respawn();
            //world.removeBody(players[data].body);
	    //container.removeChild(players[data].graphics);
	    //console.log(data + " destroyed");
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
    requestAnimationFrame(animate);

    if(myPlayer != null)
        myPlayer.processInputs();

    world.step(timeStep);
    updateParticles(timeStep);

    for(var i in players) {
    	if(players[i] != null) {
            players[i].graphics.position.x = players[i].body.position[0];
            players[i].graphics.position.y = players[i].body.position[1];
            players[i].graphics.rotation = players[i].body.angle;
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
            //particles[i].graphics.rotation = particles[i].body.angle;
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
