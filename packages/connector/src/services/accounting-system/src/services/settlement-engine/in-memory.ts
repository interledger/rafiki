import { SettlementEngine, SettlementEngineService } from '.'

export class InMemorySettlementEngineService
implements SettlementEngineService {
  private _settlementEngines: Map<string, SettlementEngine>

  constructor () {
    this._settlementEngines = new Map<string, SettlementEngine>()
  }

  public async get (id: string): Promise<SettlementEngine> {
    const settlementEngine = this._settlementEngines.get(id)
    if (!settlementEngine) throw new Error('Settlement Engine Not Found')
    return settlementEngine
  }

  public async add (
    id: string,
    settlementEngine: SettlementEngine
  ): Promise<void> {
    if (this._settlementEngines.get(id)) {
      throw new Error('Settlement Engine already exists')
    }
    this._settlementEngines.set(id, settlementEngine)
  }

  public async remove (id: string): Promise<void> {
    if (!this._settlementEngines.get(id)) {
      throw new Error('Settlement Engine does not exist')
    }
    this._settlementEngines.delete(id)
  }
}
