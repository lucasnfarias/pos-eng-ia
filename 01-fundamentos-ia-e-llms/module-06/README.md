# Prompt Structure
1. Task Context
2. Tone Context
3. Prior data, documents and images
4. Detailed description of the task and rules
5. Example
6. Chat History
7. Request/Question
8. Output format

![alt text](image.png)

## Refs
https://www.youtube.com/watch?v=ysPbXH0LpIE

# JSON Prompt
## Advantages
- predictable/structured output
- version control
- generally, token cheaper than conventional text prompt

## Cons
- Not very useful for casual conversations

## Tips
- Validate the output with some schema validator -> e.g. Zod
- Version prompts -> use `meta.version`
- Use verbose/obvious key names
- Use only relevant key/data

```json
{
  "meta": {
    "name": "task-name",
    "version": 1.0,
    "language": "en-US"
  },
  "role": "You are specialist of something",
  "context": {
    "audience": "students",
    "docLinks": [],
    "images": []
  },
  "task": {
    "goal": "This is the objective of this task",
    "type": "summary",
    "steps": []
  },
  "constraints": {
    "do_not_invent": false,
    "if_missing_data": "say_you_dont_know",
    "be_concise": true,
    "max_words": 250,
    "max_topics": 7,
    "uncertainty_policy": "if you are not certain, say you don't have enough information and ask for the missing info"
  },
  "output": {
    "format": "json",
    "schema": {
      "title": "string",
      "summary": "string",
      "topics": "string[]",
      "examples": "string[]"
    }
  }
}
```

# TOON (Token Oriented Object Notation)
- More token efficient
- Cheaper
- LLM Context Limit

## Considerations
- Sometimes you might not need TOON and can just improve your JSON structure:
- Many LLMs have been trained with massive amounts of JSON data
- Avoid repetitions in JSON (e.g. object arrays)
  ![alt text](image-1.png)
