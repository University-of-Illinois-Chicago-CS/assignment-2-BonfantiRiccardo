import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;

//Variable to store the vertices data of the map
var mapVertices = null;

function processImage(img) {
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');

	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;

	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);

	// read back the image pixel data
	var imgd = ctx.getImageData(0, 0, sw, sh);
	var px = imgd.data;

	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);

	// loop through the image, rows then columns
	for (var y = 0; y < sh; y++) {
		for (var x = 0; x < sw; x++) {
			// offset in the image buffer
			var i = (y * sw + x) * 4;

			// read the RGB pixel value
			var r = px[i + 0], g = px[i + 1], b = px[i + 2];

			// convert to greyscale value between 0 and 1
			var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;

			// store in array
			heightArray[y * sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sw
	};
}

const BASE_FACTOR = 50;
/**
 * Function to change the height factor of the vertices
 */
window.changeHeightScale = function () {
	var factor = document.getElementById("height").value;	//Get the value from the slider
	console.log("Changing height factor: " + factor);

	var newVertices = [];
	if (mapVertices) {
		for (let i = 0; i < mapVertices.length; i = i + 3) {	//For every vertex modify the y coordinate
			newVertices[i] = mapVertices[i];
			newVertices[i + 1] = mapVertices[i + 1] * (factor / BASE_FACTOR);	//Normalize factor
			newVertices[i + 2] = mapVertices[i + 2];
		}

		buffersAndVAO(newVertices);			//Update values
	}
}

var wireframe = false;
/**
 * Functon to switch between the viewing modes, if checkbox is checked then draw wireframe, otherwise draw solid triangle faces
 */
window.wireframeChange = function () {
	wireframe = document.getElementById("checkBox").checked;
	console.log("Wireframe view: " + wireframe);
}

/**
 * Function that computes the position array given an array of height data, the width and height 
 * @param data the height data from the uploaded file
 * @param width number of columns / width of the map
 * @param height  number of rows / height of the map
 * @returns the positions vector
 */
function computeMapVertices(data, width, height) {
	var result = [];

	var xStep = 2 / width;								//COmpute the step to have vertices from -1 to 1
	var zStep = 2 / height;

	//Function to compute the position of the vertex in space from pixel coordinates in heightmap
	function computeVertex(x, z) {
		var realX = -1 + x * xStep;			//The x and z have to be scaled to be between -1 and 1
		var realZ = -1 + z * zStep;
		var index = z * width + x;			//Get the index of current height by computing: rows * width + columns

		return [realX, data[index], realZ];
	}

	/*For this particular section, I have taken inspiration from: 
	https://webglfundamentals.org/webgl/lessons/webgl-fundamentals.html and other sources like stack exchange 
	
	Another slightly more lightweight approach is to use Indexing instead of quads*/
	for (let z = 0; z < height - 1; z++) {			//Cycle thorugh all coordinates but the last row and column
		for (let x = 0; x < width - 1; x++) {
			var v1 = computeVertex(x, z);			//Compute coordinates of Top-left vertex of current quad
			var v2 = computeVertex(x + 1, z);		//Do the same for: Top-Right
			var v3 = computeVertex(x, z + 1);		//Bottom-left
			var v4 = computeVertex(x + 1, z + 1);	//Bottom-right

			//Load the first triangle: Top-Left --> Top-Right --> Bottom-Left
			result.push(...v1);
			result.push(...v2);
			result.push(...v3);

			//Load Second triangle: Top-Right --> Bottom-Right --> Bottom-Left
			result.push(...v2);
			result.push(...v4);
			result.push(...v3);
		}
	}

	return result;
}

/**
 * Helper Function to create the buffer of verttices and the VAO
 * @param vertices the vertices that have to be drawn to screen
 */
function buffersAndVAO(vertices) {
	var mapPositionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(vertices));
	var mapPositionLoc = gl.getAttribLocation(program, "position");

	vao = createVAO(gl,
		mapPositionLoc, mapPositionBuffer
	);
}

window.loadImageFile = function (event) {

	var f = event.target.files && event.target.files[0];
	if (!f) return;

	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function () {
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function () {
			// heightmapData is globally defined
			heightmapData = processImage(img);

			/*
				TODO: using the data in heightmapData, create a triangle mesh
					heightmapData.data: array holding the actual data, note that 
					this is a single dimensional array the stores 2D data in row-major order

					heightmapData.width: width of map (number of columns)
					heightmapData.height: height of the map (number of rows)
			*/
			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);

			mapVertices = computeMapVertices(heightmapData.data, heightmapData.width, heightmapData.height);

			vertexCount = mapVertices.length / 3;
			console.log("Vertex count: " + vertexCount);

			buffersAndVAO(mapVertices);

			//Reset the height slider to default value
			document.getElementById("height").value = 50;
		};
		img.onerror = function () {
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function setupViewMatrix(eye, target) {
	var forward = normalize(subtract(target, eye));
	var upHint = [0, 1, 0];

	var right = normalize(cross(forward, upHint));
	var up = cross(right, forward);

	var view = lookAt(eye, target, up);
	return view;

}
function draw() {
	var fovRadians = 70 * Math.PI / 180;
	var aspectRatio = +gl.canvas.width / +gl.canvas.height;
	var nearClip = 0.001;
	var farClip = 20.0;

	// perspective projection
	var projectionMatrix;

	//Assign projection matrix depending on value of menu
	if (document.querySelector("#projection").value == 'perspective') {
		projectionMatrix = perspectiveMatrix(
			fovRadians,
			aspectRatio,
			nearClip,
			farClip,
		);
	} else {
		var size = 3;		//The vertices from the map should occupy points from -1 to 1 on the axes
		projectionMatrix = orthographicMatrix(
			-size * aspectRatio, size * aspectRatio,
			-size, size,
			nearClip,
			farClip
		);
	}



	// TODO: set up transformations to the model
	var zoomScale = 1 + (-zoom) * 0.1;
	var rotateY = yRotation * Math.PI / 180;
	var rotateZ = zRotation * Math.PI / 180;

	//Multiply transformation matrices: scale(zoom) --> y rotation --> z rotation
	var modelMatrix = multiplyMatrices( 				//APPLY TRANSFORMATIONS IN ORDER!!!
		multiplyMatrices(
			scaleMatrix(zoomScale, zoomScale, zoomScale),
			rotateYMatrix(rotateY)
		),
		rotateZMatrix(rotateZ)
	);

	// eye and target
	var eye = [0 + panX, 5, 5 + panZ];		//Pan eye and target according to variables
	var target = [0 + panX, 0, 0 + panZ];

	// setup viewing matrix
	var eyeToTarget = subtract(target, eye);
	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);


	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);

	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

	gl.bindVertexArray(vao);

	var primitiveType = wireframe? gl.LINES : gl.TRIANGLES;
	gl.drawArrays(primitiveType, 0, vertexCount);

	requestAnimationFrame(draw);

}

function createBox() {
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i = 1; i <= 3; i++) {
		var yAngle = i * (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

//Variables to store rotation values and zoom change
var yRotation = 0, zRotation = 0;
var zoom = 0;
//Variables to store panning offsets
var panX = 0, panZ = 0;

function addMouseCallback(canvas) {
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) {
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	canvas.addEventListener("contextmenu", function (e) {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function (e) {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) {
			console.log("Scrolled up");
			// e.g., zoom in
		} else {
			console.log("Scrolled down");
			// e.g., zoom out
		}
		zoom += e.deltaY * 0.01;
	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;
		console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		// implement dragging logic
		//Reset starting position
		startX = currentX;
		startY = currentY;

		if (leftMouse) {			//If left mouse button is pressed then update y rotation
			yRotation += deltaX * 0.1;			//in case of horizontal movement
			zRotation += deltaY * 0.1;			//and update z rotation in case of vertical movement
		} else {
			//Pan the camera
			panX += deltaX * 0.01;
			panZ += deltaY * 0.01;
		}
	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function initialize() {
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	console.log(box);

	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl,
		// positions
		posAttribLoc, posBuffer,

		// normals (unused in this assignments)
		null, null,

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

window.onload = initialize();