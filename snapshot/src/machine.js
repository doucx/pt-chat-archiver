/**
 * 引擎的核心状态机定义
 * 用于替代分散在 main.js 中的各种 boolean 标志，
 * 提供一个确定的、可预测的生命周期管理，并处理异步扫描的并发锁。
 */

export const EngineStates = {
  STOPPED: 'STOPPED',             // 引擎停止，尚未激活监听
  STARTING: 'STARTING',           // 进入服务器或初始化阶段，防抖收集 DOM 节点
  TAB_SWITCHING: 'TAB_SWITCHING', // 正在切换频道，等待防抖结算
  RECORDING: 'RECORDING'          // 正常运行，实时监听 DOM 增量更新
};

export class ArchiverMachine {
  constructor() {
    this.state = EngineStates.STOPPED;
    
    // 异步并发锁 (用于 scanAndMergeHistory)
    this.isScanning = false;
    this.scanPending = false;
  }

  transition(newState) {
    if (this.state === newState) return;
    this.state = newState;
  }

  canProcessLiveMessage() {
    // 只有在 RECORDING 状态下才处理 DOM Mutations 的实时增量
    return this.state === EngineStates.RECORDING;
  }

  isStarting() {
    return this.state === EngineStates.STARTING;
  }

  // --- 异步并发锁管理 ---

  tryAcquireScanLock() {
    if (this.isScanning) {
      this.scanPending = true;
      return false;
    }
    this.isScanning = true;
    this.scanPending = false;
    return true;
  }

  clearScanPending() {
    this.scanPending = false;
  }

  hasPendingScan() {
    return this.scanPending;
  }

  releaseScanLock() {
    this.isScanning = false;
  }

  reset() {
    this.state = EngineStates.STOPPED;
    this.isScanning = false;
    this.scanPending = false;
  }
}

// 导出一个单例实例供全局使用
export const engineMachine = new ArchiverMachine();