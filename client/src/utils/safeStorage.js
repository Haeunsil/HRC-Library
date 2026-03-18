/**
 * Tracking Prevention 등으로 sessionStorage가 차단된 환경에서
 * in-memory fallback을 사용하는 안전한 스토리지 래퍼
 *
 * 새로고침 시 복원: userLevel만 localStorage 사용 (창 닫았다 열면 초기화)
 * selectedQnum은 sessionStorage만 사용 (창 닫았다 열면 선택 해제)
 */
const memory = {};
const PERSIST_KEYS = ['userLevel'];

function safeGetItem(key) {
  try {
    let val = sessionStorage.getItem(key);
    if (val === null && PERSIST_KEYS.includes(key)) {
      try {
        val = localStorage.getItem('hrclib_' + key);
      } catch {
        /* localStorage 차단 시 무시 */
      }
    }
    return val ?? memory[key] ?? null;
  } catch {
    return memory[key] ?? null;
  }
}

function safeSetItem(key, value) {
  try {
    sessionStorage.setItem(key, value);
    if (PERSIST_KEYS.includes(key)) {
      try {
        localStorage.setItem('hrclib_' + key, value);
      } catch {
        /* localStorage 차단 시 무시 */
      }
    }
  } catch {
    memory[key] = value;
  }
}

function safeRemoveItem(key) {
  try {
    sessionStorage.removeItem(key);
    if (PERSIST_KEYS.includes(key)) {
      try {
        localStorage.removeItem('hrclib_' + key);
      } catch {
        /* 무시 */
      }
    }
  } catch {
    delete memory[key];
  }
}

export const safeStorage = {
  getItem: safeGetItem,
  setItem: safeSetItem,
  removeItem: safeRemoveItem,
};
