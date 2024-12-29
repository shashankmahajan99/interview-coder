// Import necessary modules
import axios from "axios"
import { store } from "../store"

// Define interfaces for ProblemInfo and related structures

interface DebugSolutionResponse {
  thoughts: string[]
  old_code: string
  new_code: string
  time_complexity: string
  space_complexity: string
}

interface ProblemInfo {
  problem_statement?: string
  input_format?: {
    description?: string
    parameters?: Array<{
      name: string
      type: string
      subtype?: string
    }>
  }
  output_format?: {
    description?: string
    type?: string
    subtype?: string
  }
  constraints?: Array<{
    description: string
    parameter?: string
    range?: {
      min?: number
      max?: number
    }
  }>
  test_cases?: any // Adjust the type as needed
}

interface StoreSchema {
  openaiApiKey: string
  // add other store fields here
}

export async function processTextQuery(query: string): Promise<any> {
  const storedApiKey = store.get("openaiApiKey")
  if (!storedApiKey) {
    throw new Error("OpenAI API key not set")
  }

  const messages = [
    {
      role: "user",
      content: `Given this programming question/problem:
${query}

Please provide a solution in this format and adhere strictly to the format restrictions given below:
{
  "thoughts": [
    "Initial analysis of the problem",
    "Approach being considered",
    "Implementation strategy"
  ],
  "code": "Complete code solution with comments",
  "explanation": "Step-by-step explanation of how the solution works",
  "time_complexity": "Big O notation with explanation",
  "space_complexity": "Big O notation with explanation"
}

Format Requirements:
1. Use actual line breaks in code field
2. Indent code properly with spaces
3. Include clear code comments
4. Response must be valid JSON
5. Return only the JSON object with no markdown or other formatting
6.The solution should be clear and educational, focused on helping someone understand the approach.
`
    }
  ]

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 4096
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedApiKey}`
        }
      }
    )
    console.log("Response:", response.data)
    let content = response.data.choices[0].message.content
    console.log("Content:", content)
    try {
      return JSON.parse(content)
    } catch (error) {
      // If its an invalid json due to '''<language> string''' format then remove the '''<language> from the string and parse it again
      content = content.replace(/'''[a-zA-Z]+/g, "")
    }
    console.log("Reparsed content:", content)
    return JSON.parse(content)
  } catch (error: any) {
    if (error.response?.status === 429) {
      throw new Error("API Key out of credits")
    }
    console.log("Error details:", error)
    throw error
  }
}

// Define the extractProblemInfo function
export async function extractProblemInfo(
  imageDataList: string[]
): Promise<any> {
  const storedApiKey = store.get("openaiApiKey")
  if (!storedApiKey) {
    throw new Error("OpenAI API key not set")
  }

  // Prepare the image contents for the message
  const imageContents = imageDataList.map((imageData) => ({
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${imageData}`
    }
  }))

  // Construct the messages to send to the model
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Extract the following information from this coding problem image:\n" +
            "1. ENTIRE Problem statement (what needs to be solved)\n" +
            "2. Input/Output format\n" +
            "3. Constraints on the input\n" +
            "4. Example test cases\n" +
            "Format each test case exactly like this:\n" +
            "{'input': {'args': [nums, target]}, 'output': {'result': [0,1]}}\n" +
            "Note: test cases must have 'input.args' as an array of arguments in order,\n" +
            "'output.result' containing the expected return value.\n" +
            "Example for two_sum([2,7,11,15], 9) returning [0,1]:\n" +
            "{'input': {'args': [[2,7,11,15], 9]}, 'output': {'result': [0,1]}}\n"
        },
        ...imageContents
      ]
    }
  ]

  // Define the function schema
  const functions = [
    {
      name: "extract_problem_details",
      description:
        "Extract and structure the key components of a coding problem",
      parameters: {
        type: "object",
        properties: {
          problem_statement: {
            type: "string",
            description:
              "The ENTIRE main problem statement describing what needs to be solved"
          },
          input_format: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Description of the input format"
              },
              parameters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Name of the parameter"
                    },
                    type: {
                      type: "string",
                      enum: [
                        "number",
                        "string",
                        "array",
                        "array2d",
                        "array3d",
                        "matrix",
                        "tree",
                        "graph"
                      ],
                      description: "Type of the parameter"
                    },
                    subtype: {
                      type: "string",
                      enum: ["integer", "float", "string", "char", "boolean"],
                      description: "For arrays, specifies the type of elements"
                    }
                  },
                  required: ["name", "type"]
                }
              }
            },
            required: ["description", "parameters"]
          },
          output_format: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Description of the expected output format"
              },
              type: {
                type: "string",
                enum: [
                  "number",
                  "string",
                  "array",
                  "array2d",
                  "array3d",
                  "matrix",
                  "boolean"
                ],
                description: "Type of the output"
              },
              subtype: {
                type: "string",
                enum: ["integer", "float", "string", "char", "boolean"],
                description: "For arrays, specifies the type of elements"
              }
            },
            required: ["description", "type"]
          },
          constraints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description: "Description of the constraint"
                },
                parameter: {
                  type: "string",
                  description: "The parameter this constraint applies to"
                },
                range: {
                  type: "object",
                  properties: {
                    min: { type: "number" },
                    max: { type: "number" }
                  }
                }
              },
              required: ["description"]
            }
          },
          test_cases: {
            type: "array",
            items: {
              type: "object",
              properties: {
                input: {
                  type: "object",
                  properties: {
                    args: {
                      type: "array",
                      items: {
                        anyOf: [
                          { type: "integer" },
                          { type: "string" },
                          {
                            type: "array",
                            items: {
                              anyOf: [
                                { type: "integer" },
                                { type: "string" },
                                { type: "boolean" },
                                { type: "null" }
                              ]
                            }
                          },
                          { type: "object" },
                          { type: "boolean" },
                          { type: "null" }
                        ]
                      }
                    }
                  },
                  required: ["args"]
                },
                output: {
                  type: "object",
                  properties: {
                    result: {
                      anyOf: [
                        { type: "integer" },
                        { type: "string" },
                        {
                          type: "array",
                          items: {
                            anyOf: [
                              { type: "integer" },
                              { type: "string" },
                              { type: "boolean" },
                              { type: "null" }
                            ]
                          }
                        },
                        { type: "object" },
                        { type: "boolean" },
                        { type: "null" }
                      ]
                    }
                  },
                  required: ["result"]
                }
              },
              required: ["input", "output"]
            },
            minItems: 1
          }
        },
        required: ["problem_statement"]
      }
    }
  ]

  // Prepare the request payload
  const payload = {
    model: "gpt-4o-mini",
    messages: messages,
    functions: functions,
    function_call: { name: "extract_problem_details" },
    max_tokens: 4096
  }

  try {
    // Send the request to the completion endpoint
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedApiKey}`
        }
      }
    )

    // Extract the function call arguments from the response
    const functionCallArguments =
      response.data.choices[0].message.function_call.arguments

    // Return the parsed function call arguments
    return JSON.parse(functionCallArguments)
  } catch (error) {
    if (error.response?.status === 429) {
      throw new Error(
        "API Key out of credits. Please refill your OpenAI API credits and try again."
      )
    }

    throw error
  }
}

export async function generateSolutionResponses(
  problemInfo: ProblemInfo
): Promise<any> {
  try {
    const storedApiKey = store.get("openaiApiKey") as string
    if (!storedApiKey) {
      throw new Error("OpenAI API key not set")
    }

    // Build the complete prompt with all problem information
    const promptContent = `Given the following coding problem:

Problem Statement:
${problemInfo.problem_statement ?? "Problem statement not available"}

Input Format:
${problemInfo.input_format?.description ?? "Input format not available"}
Parameters:
${
  problemInfo.input_format?.parameters
    ?.map((p) => `- ${p.name}: ${p.type}${p.subtype ? ` of ${p.subtype}` : ""}`)
    .join("\n") ?? "No parameters available"
}

Output Format:
${problemInfo.output_format?.description ?? "Output format not available"}
Returns: ${problemInfo.output_format?.type ?? "Type not specified"}${
      problemInfo.output_format?.subtype
        ? ` of ${problemInfo.output_format.subtype}`
        : ""
    }

Constraints:
${
  problemInfo.constraints
    ?.map((c) => {
      let constraintStr = `- ${c.description}`
      if (c.range) {
        constraintStr += ` (${c.parameter}: ${c.range.min} to ${c.range.max})`
      }
      return constraintStr
    })
    .join("\n") ?? "No constraints specified"
}

Test Cases:
${JSON.stringify(problemInfo.test_cases ?? "No test cases available", null, 2)}

Generate a solution in this format:
{
  "thoughts": [
    "First thought showing recognition of the problem and core challenge",
    "Second thought naming specific algorithm/data structure being considered",
    "Third thought showing confidence in approach while acknowledging details needed"
  ],
  "code": "The Python solution with comments explaining the code",
  "time_complexity": "The time complexity in form O(_) because _",
  "space_complexity": "The space complexity in form O(_) because _"
}

Format Requirements:
1. Use actual line breaks in code field
2. Indent code properly with spaces
3. Include clear code comments
4. Response must be valid JSON
5. Return only the JSON object with no markdown or other formatting`

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "o1-mini",
        messages: [
          {
            role: "user",
            content: promptContent
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedApiKey}`
        }
      }
    )

    const content = response.data.choices[0].message.content
    return JSON.parse(content)
  } catch (error: any) {
    if (error.response?.status === 429) {
      throw new Error(
        "API Key out of credits. Please refill your OpenAI API credits and try again."
      )
    }
    console.error("Error details:", error)
    throw new Error(`Error generating solutions: ${error.message}`)
  }
}

export async function debugSolutionResponses(
  imageDataList: string[],
  problemInfo: ProblemInfo
): Promise<DebugSolutionResponse> {
  // Process images for inclusion in prompt
  const imageContents = imageDataList.map((imageData) => ({
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${imageData}`
    }
  }))

  // Build the prompt with error handling
  const problemStatement =
    problemInfo.problem_statement ?? "Problem statement not available"

  const inputFormatDescription =
    problemInfo.input_format?.description ??
    "Input format description not available"

  const inputParameters = problemInfo.input_format?.parameters
    ? problemInfo.input_format.parameters
        .map(
          (p) => `- ${p.name}: ${p.type}${p.subtype ? ` of ${p.subtype}` : ""}`
        )
        .join(" ")
    : "Input parameters not available"

  const outputFormatDescription =
    problemInfo.output_format?.description ??
    "Output format description not available"

  const returns = problemInfo.output_format?.type
    ? `Returns: ${problemInfo.output_format.type}${
        problemInfo.output_format.subtype
          ? ` of ${problemInfo.output_format.subtype}`
          : ""
      }`
    : "Returns: Output type not available"

  const constraints = problemInfo.constraints
    ? problemInfo.constraints
        .map((c) => {
          let constraintStr = `- ${c.description}`
          if (c.range) {
            constraintStr += ` (${c.parameter}: ${c.range.min} to ${c.range.max})`
          }
          return constraintStr
        })
        .join(" ")
    : "Constraints not available"

  let exampleTestCases = "Test cases not available"
  if (problemInfo.test_cases) {
    try {
      exampleTestCases = JSON.stringify(problemInfo.test_cases, null, 2)
    } catch {
      exampleTestCases = "Test cases not available"
    }
  }

  // Construct the debug prompt
  const debugPrompt = `
Given the following coding problem and its visual representation:

Problem Statement:
${problemStatement}

Input Format:
${inputFormatDescription}
Parameters:
${inputParameters}

Output Format:
${outputFormatDescription}
${returns}

Constraints:
${constraints}

Example Test Cases:
${exampleTestCases}

First extract and analyze the code shown in the image. Then create an improved version while maintaining the same general approach and structure. The old code you save should ONLY be the exact code that you see on the screen, regardless of any optimizations or changes you make. Make all your changes in the new_code field.
Focus on keeping the solution syntactically similar but with optimizations and INLINE comments ONLY ON lines of code that were changed.

IMPORTANT FORMATTING NOTES:
1. Use actual line breaks (press enter for new lines) in both old_code and new_code
2. Maintain proper indentation with spaces in both code blocks
3. Add inline comments ONLY on changed lines in new_code
4. The entire response must be valid JSON that can be parsed`

  // Construct the messages array
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: debugPrompt
        },
        ...imageContents
      ]
    }
  ]

  // Define the function schema
  const functions = [
    {
      name: "provide_solution",
      description:
        "Debug based on the problem and provide a solution to the coding problem",
      parameters: {
        type: "object",
        properties: {
          thoughts: {
            type: "array",
            items: { type: "string" },
            description:
              "Share up to 3 key thoughts as you work through solving this problem for the first time. Write in the voice of someone actively reasoning through their approach, using natural pauses, uncertainty, and casual language that shows real-time problem solving. Each thought must be max 100 characters and be full sentences that don't sound choppy when read aloud.",
            maxItems: 3,
            thoughtGuidelines: [
              "First thought should capture that initial moment of recognition - connecting it to something familiar or identifying the core challenge. Include verbal cues like 'hmm' or 'this reminds me of' that show active thinking.",
              "Second thought must explore your emerging strategy and MUST explicitly name the algorithm or data structure being considered. Show both knowledge and uncertainty - like 'I could probably use a heap here, but I'm worried about...'",
              "Third thought should show satisfaction at having a direction while acknowledging you still need to work out specifics - like 'Okay, I think I see how this could work...'"
            ]
          },
          old_code: {
            type: "string",
            description:
              "The exact code implementation found in the image. There should be no additional lines of code added, this should only contain the code that is visible from the images, regardless of correctness or any fixes you can make."
          },
          new_code: {
            type: "string",
            description:
              "The improved code implementation with in-line comments only on lines of code that were changed"
          },
          time_complexity: {
            type: "string",
            description:
              "Time complexity with explanation, format as 'O(_) because _.' Importantly, if there were slight optimizations in the complexity that don't affect the overall complexity, MENTION THEM."
          },
          space_complexity: {
            type: "string",
            description:
              "Space complexity with explanation, format as 'O(_) because _' Importantly, if there were slight optimizations in the complexity that don't affect the overall complexity, MENTION THEM."
          }
        },
        required: [
          "thoughts",
          "old_code",
          "new_code",
          "time_complexity",
          "space_complexity"
        ]
      }
    }
  ]

  // Prepare the payload for the API call
  const payload = {
    model: "gpt-4o",
    messages: messages,
    max_tokens: 4000,
    temperature: 0,
    functions: functions,
    function_call: { name: "provide_solution" }
  }

  try {
    // Send the request to the OpenAI API
    const storedApiKey = store.get("openaiApiKey") as string
    if (!storedApiKey) {
      throw new Error("OpenAI API key not set")
    }

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedApiKey}`
        }
      }
    )

    // Extract the function call arguments from the response
    const functionCallArguments =
      response.data.choices[0].message.function_call.arguments

    // Parse and return the response
    return JSON.parse(functionCallArguments) as DebugSolutionResponse
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(
        "API endpoint not found. Please check the model name and URL."
      )
    } else if (error.response?.status === 401) {
      throw new Error("Authentication failed. Please check your API key.")
    } else if (error.response?.status === 401) {
      throw new Error(
        "API Key out of credits. Please refill your OpenAI API credits and try again."
      )
    } else {
      throw new Error(
        `OpenAI API error: ${
          error.response?.data?.error?.message || error.message
        }`
      )
    }
  }
}
