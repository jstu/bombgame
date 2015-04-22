var app = require('express')();
var p2 = require('p2');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var player;
var players = {'players':[]};
var playerList = [];
var forwarded = require('forwarded-for');
var UUID = require('node-uuid');
var bombs = [];

var world = new p2.World({
    gravity:[0, -15]
});

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){

    player = {
        id : UUID(),
	x : 10,
	y : 20
    };

    playerList[player.id] = new Player(player.id);
    players[player.id] = player;

    var ts = new Date().toString().split(' ').splice(1,4).join('/') + (" - ");

    var req = socket.request;
    var ip = forwarded(req, req.headers);
    var pid = player.id;

    console.log(ts + player.id + " connected from ip: " + ip.ip);

    socket.emit('onconnected',{pid: pid, list: players});
    socket.broadcast.emit('newconnected', pid);


    socket.on('move', function(input) {
        if(playerList[input.pid] != null)
	    playerList[input.pid].processInputs(input);
    });

    socket.on('disconnect', function() {
        console.log(ts + pid + " disconnected");
        io.emit('dc', pid);	
	world.removeBody(playerList[pid].body);

        if(players[pid] != null)
            delete players[pid];
    });
});

var body, pid;
var size = 0.23,
    dist = size * 2;
var mvspd = 4;
var jumpforce = 8;
var lastProcessedInput;
var isDead;
var ttl;

var Bomb = function(pos) {
    var circle = new p2.Circle(size/2);
    this.ttl = 3;
   
    var opts = {
        mass: 5,
        position: [pos.x, pos.y],
	velocity: [pos.vel[0] * 3, pos.vel[1] + 3],
    };
   
    this.body = new p2.Body(opts);
    this.body.addShape(circle);
    this.body.fixedRotation = false;
    this.body.damping = 0;
    this.body.gravityScale = 0.6;
    world.addBody(this.body);
};

Bomb.prototype.destroy = function (id) {
    world.removeBody(bombs[id].body);

    if(bombs[id] != null)
        delete bombs[id];

    io.emit('exploded', id);	
};

var Player = function(id) {
    var rectangle= new p2.Rectangle(size,size);
    this.pid = id; 
    this.isDead = false;
  
    var opts = { 
        mass: 1,
        position: [0,-0.5],
    };  

    this.lastProcessedInput = [];
  
    this.body = new p2.Body(opts);
    this.body.addShape(rectangle);
    this.body.fixedRotation = true;
    this.body.damping = 0.9;
    world.addBody(this.body);
};

Player.prototype.processInputs = function(input) {
    var id = input.pid;
        if(this.isDead && input.respawn)
	    this.respawn();

        if(!this.isDead) {
            if(input.up && checkIfCanJump(this.body))
	        this.body.velocity[1] = jumpforce;
        
            if(input.fire && bombs[this.pid] == null)
	        this.fire();

            if(input.right)
	        this.body.velocity[0] = mvspd;
            else if(input.left)
	        this.body.velocity[0] = -mvspd;

	this.lastProcessedInput[id] = input.seqNumber;
	}
};

Player.prototype.fire = function () {
    var pos = {
        x: this.body.position[0],
        y: this.body.position[1],
	vel: this.body.velocity,
    };

    bombs[this.pid] = new Bomb(pos);

    var data = {
        id: this.pid,
        bomb: {x: bombs[this.pid].body.position[0], y: bombs[this.pid].body.position[1]},
    };

    //console.log(data);
    io.emit('fired', data);	
};

Player.prototype.destroy = function () {
    var data = this.pid;
    io.emit('destroyed', data);	
    this.isDead = true;
    world.removeBody(playerList[this.pid].body);
};

Player.prototype.respawn = function () {
    this.body.position[0] = 0;
    this.body.position[1] = -0.5;
    world.addBody(this.body);
    this.isDead = false;
    var data = this.pid;
    io.emit('respawned', data);	
};

var Platform = function(sizeX, sizeY, posX, posY) {
    var rectangle = new p2.Rectangle(sizeX, sizeY);
    this.body = new p2.Body({
        mass: 0,
        position:[posX,posY],
    }); 

    this.body.addShape(rectangle);
    this.body.type = p2.Body.KINEMATIC;
    world.addBody(this.body);
};


//this.setWorld(world);
world.islandSplit = true;
world.sleepMode = p2.World.ISLAND_SLEEPING;
world.solver.iterations = 20;
world.solver.tolerance = 0.001;
//world.setGlobalStiffness(1e4);
world.defaultContactMaterial.friction = 1;
world.defaultContactMaterial.restitution = 0.6;

var plane = null;
var plat1 = null;
var plat2 = null;
var plat3 = null;
var plat4 = null;
var plat5 = null;
var plat6 = null;
var plat7 = null;
var plat8 = null;
var plat9 = null;
var wall1 = null;
var wall2 = null;

// Create ground
var planeShape = new p2.Plane();
var plane = new p2.Body({
    position:[0,-1],
});

plane.addShape(planeShape);
world.addBody(plane);

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

http.listen(5000, function(){
    console.log('listening on *:5000');
});

var sendStateToClients =  function() {
    var state = [];
    for(var i in playerList) {
        var p = playerList[i];
        var bomb;
        if(bombs[p.pid] != null)
            bomb = {x: bombs[p.pid].body.position[0], y: bombs[p.pid].body.position[1]};

        state.push({id: p.pid,
		    position: {x: p.body.position[0], y: p.body.position[1]},
		    bomb: bomb,
		    lastProcessedInput: p.lastProcessedInput[p.pid],
		   });
    }
    io.emit('moved', state);	
};

var physicsTimeStep = 1 / 45; // seconds 
var stateTimeStep = 1 / 30;
//gameloop
setInterval(function(){
    updateBombs(physicsTimeStep);
    world.step(physicsTimeStep);
}, 1000 * physicsTimeStep);

setInterval(function(){
    sendStateToClients();
}, 1000 * stateTimeStep);

var yAxis = p2.vec2.fromValues(0,1);
  
function checkIfCanJump(playerbody){
    var result = false;
    for(var i=0; i<world.narrowphase.contactEquations.length; i++){
        var c = world.narrowphase.contactEquations[i];
        if(c.bodyA === playerbody || c.bodyB === playerbody){
          var d = p2.vec2.dot(c.normalA, yAxis); // Normal dot Y-axis
            if(c.bodyA === playerbody) d *= -1; 
                if(d > 0.1) result = true;
        }   
    }   
    return result;
}

function updateBombs(delta) {
    for(var i in bombs) {
        if(bombs[i].ttl <= 0) {
	    explosionRadiusCheck(bombs[i].body.position);
	    bombs[i].destroy(i);
	} else
            bombs[i].ttl -= delta;
    }
}

function explosionRadiusCheck(pos) {
    var bombX = pos[0]; 
    var bombY = pos[1];
    var explosionRadius = 1.5;

    for(var i in playerList) {
        var playerX = playerList[i].body.position[0];
        var playerY = playerList[i].body.position[1];
	
	if(playerX > bombX - explosionRadius && playerX < bombX + explosionRadius) {
	    if(playerY > bombY - explosionRadius && playerY < bombY + explosionRadius) {
	       playerList[i].destroy();
            }
	}
    }
}
