import Redis from 'ioredis'
import { cloneDeep, debounce, isSymbol } from 'lodash-es'
import mitt, { Emitter } from 'mitt'
/**
 * RedisBackedObject is a class that allows you to create an object that is backed by Redis. This can be useful for caching state in long running processes.
 * Usually you manually save state to Redis, but with RedisBackedObject you can just modify the object and it will automatically save to Redis.
 */
export class RedisBackedObject<T extends object> {
  private redis: Redis
  private key: string
  private initialData: T
  proxy: T
  saveInterval: number
  initPromise: Promise<void>
  emitter: Emitter<
    Record<
      string,
      {
        path: string[]
        value: T
      }
    >
  >

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
    this.emitter = mitt()
    this.redis = redis
    this.saveInterval = saveInterval
    this.key = key
    this.initialData = cloneDeep(initialData)
    this.proxy = this.deepProxy(initialData, null)

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

  private deepProxy = (data: any, parentPath: string[]): any => {
    if (typeof data !== 'object' || data === null) {
      return data // Only proxy objects and arrays
    }

    for (const key in data) {
      data[key] = this.deepProxy(
        data[key],
        Array.isArray(parentPath) ? [...parentPath, key] : [key]
      )
    }

    return new Proxy(data, {
      set: (target, property, value) => {
        const propertyPath = isSymbol(property) ? property.toString() : property
        target[property] =
          typeof value === 'object'
            ? this.deepProxy(
                value,
                Array.isArray(parentPath)
                  ? [...parentPath, propertyPath]
                  : [propertyPath]
              )
            : value
        this.emitter.emit('set', {
          path: parentPath ? [...parentPath, propertyPath] : [propertyPath],
          value: this.proxy
        })
        this.debouncedSave()
        return true
      },
      deleteProperty: (target, property) => {
        this.emitter.emit('delete', {
          path: parentPath,
          value: this.proxy
        })
        this.debouncedSave()
        return delete target[property]
      }
    })
  }

  saveToRedis = async () => {
    await this.redis.set(this.key, JSON.stringify(this.proxy))
    this.emitter.emit('save', {
      path: [],
      value: this.proxy
    })
  }

  // @ts-expect-error works ok
  debouncedSave = debounce(this.saveToRedis, this.saveInterval, {
    leading: false,
    trailing: true // Save after the last change in the interval, other way around we would not save the last change into redis in case many changes happen in the interval
  })

  public reset() {
    Object.assign(this.proxy, this.initialData)
    this.emitter.emit('reset', {
      path: [],
      value: this.initialData
    })
  }
}
