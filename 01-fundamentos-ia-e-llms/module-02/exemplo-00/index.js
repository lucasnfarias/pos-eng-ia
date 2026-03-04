import tf from '@tensorflow/tfjs-node';

async function trainModel(inputXs, outputYs) {
  const model = tf.sequential()

  // First neural network layer:
  // input 7 positions: normalized age + 3 colors + 3 locations

  // 80 neurons
  // why?
  // reduced training data
  // more neurons, more complex, more learning, more processing

  // ReLU filters
  // Leave only relevant data go forward
  // zero or negative are thrown away
  model.add(tf.layers.dense({ inputShape: [7], units: 80, activation: 'relu' }))

  // Output
  // 3 neurons = 3 labelsNomes [premium, medium, basic]
  // activation: softmax normalize output into probabilities
  model.add(tf.layers.dense({ units: 3, activation: 'softmax' }))

  // Compile model
  // adam: Adaptive Moment Estimation
  // adjust weights and learns with the record of mistakes and hits
  // categoricalCrossentropy: compare scores of each category with the right answer
  // e.g. premium = [1,0,0]
  model.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  })

  // Model Training
  // verbose: disable internal log and use only callbacks
  // epochs: how many times will run the dataset
  // shuffle: avoid bias
  await model.fit(
    inputXs,
    outputYs,
    {
      verbose: 0,
      epochs: 100,
      shuffle: true,
      callbacks: {
        onEpochEnd(epoch, log) {
          console.log(`Epoch: ${epoch}: loss = ${log.loss}`)
        }
      }
    }
  )

  return model
}

async function predict(model, person) {
  const tfInput = tf.tensor2d(person)

  const pred = model.predict(tfInput)
  const predArray = await pred.array()

  return predArray[0].map((prob, index) => ({ prob, index }))
}

// Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
// const pessoas = [
//     { nome: "Erick", idade: 30, cor: "azul", localizacao: "São Paulo" },
//     { nome: "Ana", idade: 25, cor: "vermelho", localizacao: "Rio" },
//     { nome: "Carlos", idade: 40, cor: "verde", localizacao: "Curitiba" }
// ];

// Vetores de entrada com valores já normalizados e one-hot encoded
// Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
// const tensorPessoas = [
//     [0.33, 1, 0, 0, 1, 0, 0], // Erick
//     [0, 0, 1, 0, 0, 1, 0],    // Ana
//     [1, 0, 0, 1, 0, 0, 1]     // Carlos
// ]

// Usamos apenas os dados numéricos, como a rede neural só entende números.
// tensorPessoasNormalizado corresponde ao dataset de entrada do modelo.
const tensorPessoasNormalizado = [
    [0.33, 1, 0, 0, 1, 0, 0], // Erick
    [0, 0, 1, 0, 0, 1, 0],    // Ana
    [1, 0, 0, 1, 0, 0, 1]     // Carlos
]

// Labels das categorias a serem previstas (one-hot encoded)
// [premium, medium, basic]
const labelsNomes = ["premium", "medium", "basic"]; // Ordem dos labels
const tensorLabels = [
    [1, 0, 0], // premium - Erick
    [0, 1, 0], // medium - Ana
    [0, 0, 1]  // basic - Carlos
];

// Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
const inputXs = tf.tensor2d(tensorPessoasNormalizado)
const outputYs = tf.tensor2d(tensorLabels)

const model = await trainModel(inputXs, outputYs)

// const person = { nome: 'Benito', idade: 28, cor: 'verde', localizacao: "Curitiba"}
// normalize person age
// (28 - 25) / (40 - 25) = 0.2
const normalizedPersonTensor = [
  [
    0.2, // normalized age
    1, // blue
    0, // red
    0, // green
    1, // sp
    0, // rj
    0 // cwb
  ]
]

const predictions = await predict(model, normalizedPersonTensor)

const results = predictions
  .sort((a, b) => b.prob - a.prob)
  .map(p => `${labelsNomes[p.index]} (${(p.prob * 100).toFixed(2)}%)`)
  .join('\n')

console.log(results)
