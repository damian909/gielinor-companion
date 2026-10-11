export interface AccountTypeInfo {
  label: string;
  ironman: boolean;
  hardcore: boolean;
  ultimate: boolean;
  group: boolean;
  /** Official hiscores board (the m= part of the URL). */
  board: string;
}

const TYPES: Record<string, AccountTypeInfo> = {
  normal: { label: 'Normal account', ironman: false, hardcore: false, ultimate: false, group: false, board: 'hiscore_oldschool' },
  ironman: { label: 'Ironman', ironman: true, hardcore: false, ultimate: false, group: false, board: 'hiscore_oldschool_ironman' },
  ultimate_ironman: { label: 'Ultimate Ironman', ironman: true, hardcore: false, ultimate: true, group: false, board: 'hiscore_oldschool_ultimate' },
  hardcore_ironman: { label: 'Hardcore Ironman', ironman: true, hardcore: true, ultimate: false, group: false, board: 'hiscore_oldschool_hardcore_ironman' },
  group_ironman: { label: 'Group Ironman', ironman: true, hardcore: false, ultimate: false, group: true, board: 'hiscore_oldschool' },
  hardcore_group_ironman: { label: 'Hardcore Group Ironman', ironman: true, hardcore: true, ultimate: false, group: true, board: 'hiscore_oldschool' },
  unranked_group_ironman: { label: 'Unranked Group Ironman', ironman: true, hardcore: false, ultimate: false, group: true, board: 'hiscore_oldschool' },
};

export function accountTypeInfo(name: string | undefined, hardcoreStatusLost = false): AccountTypeInfo {
  const info = TYPES[name ?? ''] ?? TYPES.normal;
  if (hardcoreStatusLost && info.hardcore) {
    // A hardcore that died plays on as a regular (group) ironman.
    return { ...info, label: `${info.label} (hardcore status lost)`, hardcore: false, board: info.group ? info.board : TYPES.ironman.board };
  }
  return info;
}

export const HISCORE_BOARDS = ['hiscore_oldschool', 'hiscore_oldschool_ironman', 'hiscore_oldschool_hardcore_ironman', 'hiscore_oldschool_ultimate'] as const;
