/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ValueType, Attributes } from '@opentelemetry/api-metrics'
import { Context, HrTime, trace } from '@opentelemetry/api'
import { Exemplar } from './Exemplar'


/**
 * An interface for an exemplar reservoir of samples.
 */
export interface ExemplarReservoir {

  /** Offers a measurement to be sampled. */
  offerMeasurement(
    value: ValueType,
    timestamp: HrTime,
    attributes: Attributes,
    ctx: Context    
  ): void;
  /**
   * Returns accumulated Exemplars and also resets the reservoir
   * for the next sampling period
   * 
   * @param pointAttributes The attributes associated with metric point. 
   */
  collectAndReset(pointAttributes: Attributes): ReadonlyArray<Exemplar>;
}


class StorageItem {
  private value: ValueType = 0;
  private attributes: Attributes = null;
  private timestamp: HrTime = [0, 0];
  private spanId?: string;
  private traceId?: string;

  constructor() {}

  offerMeasurement(value: ValueType, timestamp: HrTime, attributes: Attributes, ctx: Context) {
    this.value = value;
    this.attributes = attributes;
    this.timestamp = timestamp;
    const spanContext = trace.getSpanContext(ctx);
    this.spanId = spanContext?.spanId;
    this.traceId = spanContext?.traceId;
  }

  getAndReset(pointAttributes: Attributes): Exemplar | null {
    const currentAttriubtes = this.attributes;
    if (currentAttriubtes !== null) {
      Object.keys(pointAttributes).forEach(key => {
        if (pointAttributes[key] === currentAttriubtes[key]) {
          delete currentAttriubtes[key];
        }
      });
      const retVal: Exemplar = {
        filteredAttributes: currentAttriubtes,
        value: this.value,
        timestamp: this.timestamp,
        spanId: this.spanId,
        traceId: this.traceId
      };
      this.attributes = null;
      this.value = 0;
      this.timestamp = [0, 0];
      this.spanId = undefined;
      this.traceId = undefined;
      return retVal;
    }
    return null;
  }
}


export abstract class FixedSizeExemplarReservoirBase implements ExemplarReservoir {
  private _reservoirStorage: StorageItem[];
  protected _size: number;

  constructor(size: number) {
    this._size = size;
    this._reservoirStorage = new Array<StorageItem>(size);
    for(let i = 0; i < this._size; i++) {
      this._reservoirStorage[i] = new StorageItem();
    }
  }

  abstract reservoirIndexFor(value: ValueType, timestamp: HrTime, attributes: Attributes, ctx: Context): number;

  maxSize(): number {
    return this._size;
  }

  offerMeasurement(value: ValueType, timestamp: HrTime, attributes: Attributes, ctx: Context) {
    const index = this.reservoirIndexFor(value, timestamp, attributes, ctx);
    if (index !== -1) {
      this._reservoirStorage[index].offerMeasurement(value, timestamp, attributes, ctx)
    }
  }

  reset() {}

  collectAndReset(pointAttributes: Attributes): ReadonlyArray<Exemplar> {
    const retVal: Exemplar[] = [];
    this._reservoirStorage.forEach(storageItem => {
      const res = storageItem.getAndReset(pointAttributes);
      if (res !== null) {
        retVal.push(res);
      }
    });
    this.reset();
    return retVal;
  }
}