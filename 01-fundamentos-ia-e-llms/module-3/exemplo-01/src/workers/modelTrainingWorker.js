import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
import { workerEvents } from '../events/constants.js';

console.log('Model training worker initialized');
let _globalCtx = {};
let _model = null;

const WEIGHTS = {
  category: 0.4,
  color: 0.3,
  price: 0.2,
  age: 0.1,
}

// range 0 to 1
// e.g. price=129.99, minPrice=39.99, maxPrice=199.99 -> 0.56
const normalize = (value, min, max) => (value - min) / ((max - min) || 1)

function makeContext(catalog, users) {
  const ages = users.map(u => u.age)
  const prices = catalog.map(p => p.price)

  const minAge = Math.min(...ages)
  const maxAge = Math.max(...ages)

  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  const colors = [...new Set(catalog.map(p => p.color))]
  const categories = [...new Set(catalog.map(p => p.category))]

  const colorsIndex = Object.fromEntries(colors.map((color, index) => {
    return [color, index]
  }))
  const categoriesIndex = Object.fromEntries(categories.map((category, index) => {
    return [category, index]
  }))

  const midAge = (minAge + maxAge) / 2
  const ageSums = {}
  const ageCounts = {}

  users.forEach(user => {
    user.purchases.forEach(p => {
      ageSums[p.name] = (ageSums[p.name] || 0) + user.age
      ageCounts[p.name] = (ageCounts[p.name] || 0) + 1
    })
  })

  const productAvgAgeNormalized = Object.fromEntries(
    catalog.map(p => {
      const avg = ageCounts[p.name]
        ? ageSums[p.name] / ageCounts[p.name]
        : midAge

      return [p.name, normalize(avg, minAge, maxAge)]
    })
  )

  return {
    catalog,
    users,
    colorsIndex,
    categoriesIndex,
    productAvgAgeNormalized,
    minAge,
    maxAge,
    minPrice,
    maxPrice,
    numCategories: categories.length,
    numColors: colors.length,
    // price + age + colors + categories
    dimensions: 2 + colors.length + categories.length,
  }
}

const oneHotWeighted = (index, length, weight) =>
  tf.oneHot(index, length).cast('float32').mul(weight)

function encodeProduct(product, context) {
  // normalize to 0-1 range
  // add weight to the recommendation
  const price = tf.tensor1d([
    normalize(
      product.price,
      context.minPrice,
      context.maxPrice,
    ) * WEIGHTS.price
  ])
  // if nobody bought the product we set an arbitrary value of 0.5
  const age = tf.tensor1d([
    (context.productAvgAgeNormalized[product.name] ?? 0.5) * WEIGHTS.price
  ])
  const category = oneHotWeighted(
    context.categoriesIndex[product.category],
    context.numCategories,
    WEIGHTS.category,
  )
  const color = oneHotWeighted(
    context.colorsIndex[product.color],
    context.numColors,
    WEIGHTS.color,
  )

  return tf.concat1d(
    [price, age, category, color]
  )
}

function encodeUser(user, context) {
  if (user.purchases.length) {
    return tf.stack(
      user.purchases.map(product => encodeProduct(product, context))
    )
    .mean(0)
    .reshape([1, context.dimensions])
  }

  return tf.concat1d(
    [
      tf.zeros([1]), // ignore price
      tf.tensor1d([
        normalize(
          user.age,
          context.minAge,
          context.maxAge,
        ) * WEIGHTS.age
      ]),
      tf.zeros([context.numCategories]), // ignore category
      tf.zeros([context.numColors]), // ignore colors
    ]
  ).reshape([1, context.dimensions])
}

function createTrainingData(context) {
  const inputs = []
  const labels = []

  context.users
    .filter(u => u.purchases.length)
    .forEach(user => {
      const userVector = encodeUser(user, context).dataSync()
      context.catalog.forEach(product => {
        const productVector = encodeProduct(product, context).dataSync()

        const label = user.purchases.some(
          purchase => purchase.name === product.name ? 1 : 0
        )

        // combine user and product
        inputs.push([...userVector, ...productVector])
        // labels are the expected output - who bought what?
        labels.push(label)
      })
    })

  return {
    xs: tf.tensor2d(inputs),
    ys: tf.tensor2d(labels, [labels.length, 1]),
    // size = userVector + productVector
    inputDimension: context.dimensions * 2
  }
}

async function configureNeuralNetAndTrain(trainingData) {
  const model = tf.sequential()

  // middle layers
  model.add(
    tf.layers.dense({
      inputShape: [trainingData.inputDimension],
      units: 128,
      activation: 'relu'
    })
  )
  model.add(
    tf.layers.dense({
      units: 64,
      activation: 'relu'
    })
  )
  model.add(
    tf.layers.dense({
      units: 32,
      activation: 'relu'
    })
  )

  // output layer
  // recommendation 0 to 1
  // e.g 0.9 strong and 0.1 weak
  model.add(
    tf.layers.dense({
      units: 1,
      activation: 'sigmoid'
    })
  )

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  })

  await model.fit(trainingData.xs, trainingData.ys, {
    epochs: 100,
    batchSize: 32,
    shuffle: true,
    callbacks: {
      onEpochEnd(epoch, logs) {
        // send loss and accuracy info to tf charts
        postMessage({
          type: workerEvents.trainingLog,
          epoch: epoch,
          loss: logs.loss,
          accuracy: logs.acc
        });
      }
    }
  })

  return model
}

async function trainModel({ users }) {
    console.log('Training model with users:', users)

    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 50 } });

    const catalog = await (await fetch('/data/products.json')).json()

    const context = makeContext(catalog, users)
    context.productVectors = catalog.map(product => {
      return {
        name: product.name,
        meta: { ...product },
        vector: encodeProduct(product, context).dataSync()
      }
    })

    _globalCtx = context

    const trainingData = createTrainingData(context)

    _model = await configureNeuralNetAndTrain(trainingData)

    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 100 } });
    postMessage({ type: workerEvents.trainingComplete });
}

function recommend(user) {
    if (!_model) return

    const context = _globalCtx
    const userVector = encodeUser(user, context).dataSync()

    const inputs = context.productVectors.map(({ vector }) => {
      return [...userVector, ...vector]
    })
    const inputTensor = tf.tensor2d(inputs)

    const predictions = _model.predict(inputTensor)

    const scores = predictions.dataSync()

    const recommendations = context.productVectors.map((item, index) => {
      return {
        ...item.meta,
        name: item.name,
        score: scores[index]
      }
    })
    const sortedItems = recommendations.sort((a, b) => b.score - a.score)
    console.log('will recommend for user:', user)
    postMessage({
      type: workerEvents.recommend,
      user,
      recommendations: sortedItems
    });
}


const handlers = {
    [workerEvents.trainModel]: trainModel,
    [workerEvents.recommend]: d => recommend(d.user, _globalCtx),
};

self.onmessage = e => {
    const { action, ...data } = e.data;
    if (handlers[action]) handlers[action](data);
};
