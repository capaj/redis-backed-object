# redis-backed-object

a simple library which allows to create an object which is backed by redis.

Potential usecases:

- caching state between multiple runs of the same process
- caching state between lambda function runs or even between

### Usage

```ts
import { RedisBackedObject } from 'redis-backed-object'

const state = new RedisBackedObject(
  {
    redis: redisClient,
    key: 'rbo:test',
    saveInterval: 2
  },
  {
    a: 1
  }
)
const proxy = state.getProxy()
proxy.a = 2

await sleep(2)
const data = await redisClient.get('rbo:test')
expect(data).toBe('{"a":2}')
```
