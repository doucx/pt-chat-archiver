import { beforeEach, describe, expect, it } from 'vitest';
import { ArchiverMachine, EngineStates } from '../src/machine.js';

describe('ArchiverMachine (State Machine)', () => {
  let machine;

  beforeEach(() => {
    machine = new ArchiverMachine();
  });

  it('应当具有正确的初始状态', () => {
    expect(machine.state).toBe(EngineStates.STOPPED);
    expect(machine.isScanning).toBe(false);
    expect(machine.scanPending).toBe(false);
  });

  it('transition() 应当能正确改变状态', () => {
    machine.transition(EngineStates.STARTING);
    expect(machine.state).toBe(EngineStates.STARTING);
    expect(machine.isStarting()).toBe(true);

    machine.transition(EngineStates.RECORDING);
    expect(machine.state).toBe(EngineStates.RECORDING);
    expect(machine.canProcessLiveMessage()).toBe(true);
  });

  it('transition() 到相同状态时不应有副作用', () => {
    machine.transition(EngineStates.RECORDING);
    const firstState = machine.state;
    machine.transition(EngineStates.RECORDING);
    expect(machine.state).toBe(firstState);
  });

  describe('并发锁管理 (Scan Lock)', () => {
    it('在空闲时应当能获取锁', () => {
      const acquired = machine.tryAcquireScanLock();
      expect(acquired).toBe(true);
      expect(machine.isScanning).toBe(true);
    });

    it('在已加锁时尝试获取锁，应当标记为 pending', () => {
      machine.tryAcquireScanLock();
      const secondAttempt = machine.tryAcquireScanLock();
      
      expect(secondAttempt).toBe(false);
      expect(machine.isScanning).toBe(true);
      expect(machine.scanPending).toBe(true);
      expect(machine.hasPendingScan()).toBe(true);
    });

    it('releaseScanLock() 应当释放锁定状态', () => {
      machine.tryAcquireScanLock();
      machine.releaseScanLock();
      expect(machine.isScanning).toBe(false);
    });

    it('clearScanPending() 应当清除待处理标记', () => {
      machine.tryAcquireScanLock();
      machine.tryAcquireScanLock(); // 产生 pending
      machine.clearScanPending();
      expect(machine.scanPending).toBe(false);
    });
  });

  it('reset() 应当恢复所有初始值', () => {
    machine.transition(EngineStates.RECORDING);
    machine.tryAcquireScanLock();
    machine.tryAcquireScanLock();
    
    machine.reset();
    
    expect(machine.state).toBe(EngineStates.STOPPED);
    expect(machine.isScanning).toBe(false);
    expect(machine.scanPending).toBe(false);
  });
});