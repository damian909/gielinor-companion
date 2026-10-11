package com.gielinorcompanion.exporter;

import java.util.HashSet;
import java.util.Set;
import net.runelite.api.gameval.VarbitID;

/**
 * Achievement Diary tiers. The completion varbits mean "all tasks of the tier done" (not "reward
 * claimed"); the Karamja easy/medium/hard ones are older counters: 2 = completed, 1 = started.
 * The count varbits hold how many tasks of a tier are done; totals come from the game's
 * diary_completion_info script.
 */
enum Diary
{
	ARDOUGNE("Ardougne",
		new int[]{VarbitID.ARDOUGNE_DIARY_EASY_COMPLETE, VarbitID.ARDOUGNE_DIARY_MEDIUM_COMPLETE, VarbitID.ARDOUGNE_DIARY_HARD_COMPLETE, VarbitID.ARDOUGNE_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.ARDOUGNE_EASY_COUNT, VarbitID.ARDOUGNE_MED_COUNT, VarbitID.ARDOUGNE_HARD_COUNT, VarbitID.ARDOUGNE_ELITE_COUNT},
		new int[]{10, 12, 12, 8}),
	DESERT("Desert",
		new int[]{VarbitID.DESERT_DIARY_EASY_COMPLETE, VarbitID.DESERT_DIARY_MEDIUM_COMPLETE, VarbitID.DESERT_DIARY_HARD_COMPLETE, VarbitID.DESERT_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.DESERT_EASY_COUNT, VarbitID.DESERT_MED_COUNT, VarbitID.DESERT_HARD_COUNT, VarbitID.DESERT_ELITE_COUNT},
		new int[]{11, 12, 10, 6}),
	FALADOR("Falador",
		new int[]{VarbitID.FALADOR_DIARY_EASY_COMPLETE, VarbitID.FALADOR_DIARY_MEDIUM_COMPLETE, VarbitID.FALADOR_DIARY_HARD_COMPLETE, VarbitID.FALADOR_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.FALADOR_EASY_COUNT, VarbitID.FALADOR_MED_COUNT, VarbitID.FALADOR_HARD_COUNT, VarbitID.FALADOR_ELITE_COUNT},
		new int[]{11, 14, 11, 6}),
	FREMENNIK("Fremennik",
		new int[]{VarbitID.FREMENNIK_DIARY_EASY_COMPLETE, VarbitID.FREMENNIK_DIARY_MEDIUM_COMPLETE, VarbitID.FREMENNIK_DIARY_HARD_COMPLETE, VarbitID.FREMENNIK_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.FREMENNIK_EASY_COUNT, VarbitID.FREMENNIK_MED_COUNT, VarbitID.FREMENNIK_HARD_COUNT, VarbitID.FREMENNIK_ELITE_COUNT},
		new int[]{10, 9, 9, 6}),
	KANDARIN("Kandarin",
		new int[]{VarbitID.KANDARIN_DIARY_EASY_COMPLETE, VarbitID.KANDARIN_DIARY_MEDIUM_COMPLETE, VarbitID.KANDARIN_DIARY_HARD_COMPLETE, VarbitID.KANDARIN_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.KANDARIN_EASY_COUNT, VarbitID.KANDARIN_MED_COUNT, VarbitID.KANDARIN_HARD_COUNT, VarbitID.KANDARIN_ELITE_COUNT},
		new int[]{11, 14, 11, 7}),
	KARAMJA("Karamja",
		new int[]{VarbitID.ATJUN_EASY_DONE, VarbitID.ATJUN_MED_DONE, VarbitID.ATJUN_HARD_DONE, VarbitID.KARAMJA_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.KARAMJA_EASY_COUNT, VarbitID.KARAMJA_MED_COUNT, VarbitID.KARAMJA_HARD_COUNT, VarbitID.KARAMJA_ELITE_COUNT},
		new int[]{10, 19, 10, 5}),
	KOUREND("Kourend & Kebos",
		new int[]{VarbitID.KOUREND_DIARY_EASY_COMPLETE, VarbitID.KOUREND_DIARY_MEDIUM_COMPLETE, VarbitID.KOUREND_DIARY_HARD_COMPLETE, VarbitID.KOUREND_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.KOUREND_EASY_COUNT, VarbitID.KOUREND_MED_COUNT, VarbitID.KOUREND_HARD_COUNT, VarbitID.KOUREND_ELITE_COUNT},
		new int[]{12, 13, 10, 8}),
	LUMBRIDGE("Lumbridge & Draynor",
		new int[]{VarbitID.LUMBRIDGE_DIARY_EASY_COMPLETE, VarbitID.LUMBRIDGE_DIARY_MEDIUM_COMPLETE, VarbitID.LUMBRIDGE_DIARY_HARD_COMPLETE, VarbitID.LUMBRIDGE_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.LUMBRIDGE_EASY_COUNT, VarbitID.LUMBRIDGE_MED_COUNT, VarbitID.LUMBRIDGE_HARD_COUNT, VarbitID.LUMBRIDGE_ELITE_COUNT},
		new int[]{12, 12, 11, 6}),
	MORYTANIA("Morytania",
		new int[]{VarbitID.MORYTANIA_DIARY_EASY_COMPLETE, VarbitID.MORYTANIA_DIARY_MEDIUM_COMPLETE, VarbitID.MORYTANIA_DIARY_HARD_COMPLETE, VarbitID.MORYTANIA_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.MORYTANIA_EASY_COUNT, VarbitID.MORYTANIA_MED_COUNT, VarbitID.MORYTANIA_HARD_COUNT, VarbitID.MORYTANIA_ELITE_COUNT},
		new int[]{11, 11, 10, 6}),
	VARROCK("Varrock",
		new int[]{VarbitID.VARROCK_DIARY_EASY_COMPLETE, VarbitID.VARROCK_DIARY_MEDIUM_COMPLETE, VarbitID.VARROCK_DIARY_HARD_COMPLETE, VarbitID.VARROCK_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.VARROCK_EASY_COUNT, VarbitID.VARROCK_MED_COUNT, VarbitID.VARROCK_HARD_COUNT, VarbitID.VARROCK_ELITE_COUNT},
		new int[]{14, 13, 10, 5}),
	WESTERN("Western Provinces",
		new int[]{VarbitID.WESTERN_DIARY_EASY_COMPLETE, VarbitID.WESTERN_DIARY_MEDIUM_COMPLETE, VarbitID.WESTERN_DIARY_HARD_COMPLETE, VarbitID.WESTERN_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.WESTERN_EASY_COUNT, VarbitID.WESTERN_MED_COUNT, VarbitID.WESTERN_HARD_COUNT, VarbitID.WESTERN_ELITE_COUNT},
		new int[]{11, 13, 13, 7}),
	WILDERNESS("Wilderness",
		new int[]{VarbitID.WILDERNESS_DIARY_EASY_COMPLETE, VarbitID.WILDERNESS_DIARY_MEDIUM_COMPLETE, VarbitID.WILDERNESS_DIARY_HARD_COMPLETE, VarbitID.WILDERNESS_DIARY_ELITE_COMPLETE},
		new int[]{VarbitID.WILDERNESS_EASY_COUNT, VarbitID.WILDERNESS_MED_COUNT, VarbitID.WILDERNESS_HARD_COUNT, VarbitID.WILDERNESS_ELITE_COUNT},
		new int[]{12, 11, 10, 7});

	static final String[] TIERS = {"easy", "medium", "hard", "elite"};

	final String displayName;
	/** Tier-complete varbits: easy, medium, hard, elite. */
	final int[] varbits;
	/** Completed-task count varbits: easy, medium, hard, elite. */
	final int[] countVarbits;
	/** Number of tasks per tier. */
	final int[] totals;

	Diary(String displayName, int[] varbits, int[] countVarbits, int[] totals)
	{
		this.displayName = displayName;
		this.varbits = varbits;
		this.countVarbits = countVarbits;
		this.totals = totals;
	}

	boolean isComplete(int tierIndex, int value)
	{
		if (this == KARAMJA && tierIndex < 3)
		{
			return value >= 2;
		}
		return value > 0;
	}

	private static final Set<Integer> ALL_VARBITS = new HashSet<>();
	private static final Set<Integer> TASK_VARPS = new HashSet<>();

	static
	{
		for (Diary d : values())
		{
			for (int v : d.varbits)
			{
				ALL_VARBITS.add(v);
			}
			for (int v : d.countVarbits)
			{
				ALL_VARBITS.add(v);
			}
		}
		for (int v : DiaryTaskVars.VARBITS)
		{
			ALL_VARBITS.add(v);
		}
		for (int v : DiaryTaskVars.VARPS)
		{
			TASK_VARPS.add(v);
		}
	}

	/** Whether a var change may affect diary progress. */
	static boolean isDiaryVar(int varpId, int varbitId)
	{
		return ALL_VARBITS.contains(varbitId) || TASK_VARPS.contains(varpId);
	}
}
