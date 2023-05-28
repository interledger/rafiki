export type Filter = FilterString | FilterNumber

export interface FilterString {
  in?: string[]
  startsWith?: string
}

export interface FilterNumber {
  gte?: number
}

export enum FilterType {
  String = 'string',
  Number = 'number'
}

export interface FilterToKnexWhereConfig {
  name: string
  type: FilterType
  filter: Filter
}

// Call in resolver, pass filter config into service
export function filterToKnexWhereConfig (info: any, filter: any): FilterToKnexWhereConfig[]  {
  const configs: FilterToKnexWhereConfig[] = []
  // TODO: implement
  // - for each property on filter, get type names from info object and push FilterToKnexWhereConfig obj to array
  // - should end up with something like:
  // [
  //   {
  //     name: 'amount',
  //     type: FilterType.Number,
  //     filter
  //   }
  // ]
  return configs
}

// Call in servive like: 
// await WebhookEvents.query(knex)
//    .where((builder) => mapFilterToKnexWhere(builder, configs))
export function mapFilterToKnexWhere (
  builder: any,
  configs: FilterToKnexWhereConfig[]
) {
  // configure mapper for each filter type (FilterString, FilterNumber, etc.)
  configs.forEach((config) => {
    if (config.type === FilterType.String) {
      mapFilterStringToKnexWhere(builder, config)
    } else if (config.type === FilterType.Number) {
      mapFilterNumberToKnexWhere(builder, config)
    }
  })
}

function mapFilterStringToKnexWhere (
  builder: any,
  config: FilterToKnexWhereConfig
) {
  Object.entries(config.filter).forEach(([operator, value]) => {
    if (operator === 'in' && value.length > 0) {
      builder.whereIn(config.name, value)
    }
    // if (operator === 'startsWith' && value) {
    //   // parameterized to prevent SQL injection
    //   builder.where(config.name, 'ILIKE', deps.knex.raw('?', `${value}%`))
    // }
  })
}

function mapFilterNumberToKnexWhere (
  builder: any,
  config: FilterToKnexWhereConfig
) {
  Object.entries(config.filter).forEach(([operator, value]) => {
    if (operator === 'gte') {
      builder.where(config.name, '>=', value)
    }
  })
}
