importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest');

const MODEL_PATH = `yolov5n_web_model/model.json`;
const LABELS_PATH = `yolov5n_web_model/labels.json`;
// yolo model works with an image 640x640 (_model.inputs[0].shape)
const INPUT_MODEL_DIMENSION = 640
// if the model is 50% sure it found a kite, it should fire (this was defined by manual testing)
const CLASS_THRESHOLD = 0.5

let _labels = []
let _model = null
async function loadModelAndLabels() {
  await tf.ready()

  _labels = await (await fetch(LABELS_PATH)).json()
  _model = await tf.loadGraphModel(MODEL_PATH)

  // warmup
  const dummyInput = tf.ones(_model.inputs[0].shape)
  await _model.executeAsync(dummyInput)
  tf.dispose(dummyInput)

  postMessage({ type: 'model-loaded' })
}

function preProcessImage(input) {
  // tidy -> temporary tensors will be removed automatically
  // this way you don't need to do .dispose()
  return tf.tidy(() => {
    const image = tf.browser.fromPixels(input)

    return tf
      .image
      // resize image to model input dimensions
      .resizeBilinear(image, [INPUT_MODEL_DIMENSION, INPUT_MODEL_DIMENSION])
      // normalize values to 0-1
      .div(255)
      // add batch dimension [1, h, w, 3] -> evaluates 3 by 3
      .expandDims(0)
  })
}

async function runInference(tensor) {
  const output = await _model.executeAsync(tensor)
  tf.dispose(tensor)

  const [boxes, scores, classes] = output.slice(0, 3)
  const [boxesData, scoresData, classesData] = await Promise.all(
    [
      boxes.data(),
      scores.data(),
      classes.data(),
    ]
  )

  output.forEach(t => t.dispose())

  return {
    boxes: boxesData,
    scores: scoresData,
    classes: classesData,
  }
}

function* processPrediction({ boxes, scores, classes }, width, height) {
  for (let index = 0; index < scores.length; index++) {
    if (scores[index] < CLASS_THRESHOLD) continue

    const label = _labels[classes[index]]

    if (label !== 'kite') continue

    let [x1, y1, x2, y2] = boxes.slice(index * 4, (index + 1) * 4)
    x1 *= width
    x2 *= width
    y1 *= height
    y2 *= height

    const boxWidth = x2 - x1
    const boxHeight = y2 - y1
    const centerX = x1 + boxWidth / 2
    const centerY = y1 + boxHeight / 2

    yield {
      x: centerX,
      y: centerY,
      score: (scores[index] * 100).toFixed(2)
    }
  }
}

loadModelAndLabels()

self.onmessage = async ({ data }) => {
    if (data.type !== 'predict') return
    if (!_model) return

    const input = preProcessImage(data.image)
    const { width, height } = data.image

    const inferenceResults = await runInference(input)

    for (const { x, y, score } of processPrediction(inferenceResults, width, height)) {
      postMessage({
        type: 'prediction',
        x,
        y,
        score,
      });
    }
};

console.log('🧠 YOLOv5n Web Worker initialized');
