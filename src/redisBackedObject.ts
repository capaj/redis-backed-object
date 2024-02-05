import Redis from 'ioredis'
import { debounce } from 'lodash-es'

/**
 * RedisBackedObject is a class that allows you to create an object that is backed by Redis. This can be useful for caching state in long running processes.
 * Usually you manually save state to Redis, but with RedisBackedObject you can just modify the object and it will automatically save to Redis.
 */
export class RedisBackedObject<T extends object> {
  private redis: Redis
  private key: string
  private initialData: T
  private proxy: T
  saveInterval: number
  initPromise: Promise<void>

  constructor(
    {
      redis,
      key,
      saveInterval = 1000
    }: {
      redis: Redis
      key: string
      saveInterval?: number
    },
    initialData: T
  ) {
    this.redis = redis
    this.saveInterval = saveInterval
    this.key = key
    this.initialData = initialData
    this.proxy = this.deepProxy(this.initialData)

    this.initPromise = this.init()
  }

  private async init() {
    const storedData = await this.redis.get(this.key)
    if (!storedData) {
      return
    }
    const parsed = JSON.parse(storedData)
    if (this.proxy) {
      Object.assign(this.proxy, parsed)
    }
  }

  private deepProxy = (data: any): any => {
    if (typeof data !== 'object' || data === null) {
      return data // Only proxy objects and arrays
    }

    for (const key in data) {
      data[key] = this.deepProxy(data[key])
    }

    return new Proxy(data, {
      set: (target, property, value) => {
        target[property] =
          typeof value === 'object' ? this.deepProxy(value) : value
        this.debouncedSave()
        return true
      },
      deleteProperty: (target, property) => {
        this.debouncedSave()
        return delete target[property]
      }
    })
  }

  saveToRedis = async () => {
    await this.redis.set(this.key, JSON.stringify(this.proxy))
  }

  // @ts-expect-error works ok
  debouncedSave = debounce(this.saveToRedis, this.saveInterval, {
    leading: false,
    trailing: true // Save after the last change in the interval, other way around we would not save the last change into redis in case many changes happen in the interval
  })

  public getProxy() {
    return this.proxy
  }
}
