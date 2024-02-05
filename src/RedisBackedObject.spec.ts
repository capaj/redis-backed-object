import { beforeEach, describe, expect, it } from 'vitest'
import { RedisBackedObject } from './redisBackedObject'
import Redis, { RedisOptions } from 'ioredis'

const dbOrdinal = Number(process.env.VITEST_WORKER_ID) % 16 // by default redis has 16 databases, we need to tweak the config if we need more

export const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  db: process.env.VITEST_WORKER_ID ? dbOrdinal : undefined,
  connectTimeout: 2000,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  enableAutoPipelining: true
}

export const redisClient = new Redis(redisOptions)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('RedisBackedObject', () => {
  beforeEach(async () => {
    await redisClient.del('rbo:test')
    await redisClient.flushdb()
  })

  it('should save to Redis', async () => {
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
    const proxy = state.proxy
    proxy.a = 2

    await sleep(2)
    const data = await redisClient.get('rbo:test')
    expect(data).toBe('{"a":2}')

    proxy.a = 3
    await sleep(2)
    const data2 = await redisClient.get('rbo:test')
    expect(data2).toBe('{"a":3}')

    // @ts-expect-error
    delete proxy.a
    await sleep(2)
    const data3 = await redisClient.get('rbo:test')
    expect(data3).toBe('{}')

    // @ts-expect-error
    proxy.array = [1, 2, 3]
    await sleep(2)
    const data4 = await redisClient.get('rbo:test')
    expect(data4).toBe('{"array":[1,2,3]}')

    // @ts-expect-error
    proxy.array.push(4)
    await sleep(2)
    const data5 = await redisClient.get('rbo:test')
    expect(data5).toBe('{"array":[1,2,3,4]}')

    // @ts-expect-error
    proxy.array.pop()
    await sleep(2)
    const data5b = await redisClient.get('rbo:test')
    expect(data5b).toBe('{"array":[1,2,3]}')

    // nested objects
    // @ts-expect-error
    proxy.nested = { a: [1] }
    await sleep(2)
    const data6 = await redisClient.get('rbo:test')
    expect(data6).toBe('{"array":[1,2,3],"nested":{"a":[1]}}')
    // @ts-expect-error
    proxy.nested.a.push(2)
    await sleep(2)
    const data7 = await redisClient.get('rbo:test')
    expect(data7).toBe('{"array":[1,2,3],"nested":{"a":[1,2]}}')
  })

  it('should load from Redis', async () => {
    await redisClient.set('rbo:test2', '{"a":4}')

    const state = new RedisBackedObject(
      {
        redis: redisClient,
        key: 'rbo:test2',
        saveInterval: 2
      },
      {
        a: 1
      }
    )

    const proxy = state.proxy
    expect(proxy.a).toBe(1) // before init runs we have the default

    await sleep(65)
    expect(proxy.a).toBe(4)
  })

  it('should reset to initial state', async () => {
    const state = new RedisBackedObject(
      {
        redis: redisClient,
        key: 'rbo:test3',
        saveInterval: 2
      },
      {
        a: 15
      }
    )
    const proxy = state.proxy
    proxy.a = 2
    await sleep(2)
    const data = await redisClient.get('rbo:test3')
    expect(data).toBe('{"a":2}')

    state.reset()
    expect(proxy.a).toBe(15)
    await sleep(2)
    const data2 = await redisClient.get('rbo:test3')
    expect(data2).toBe('{"a":15}')
  })
})
