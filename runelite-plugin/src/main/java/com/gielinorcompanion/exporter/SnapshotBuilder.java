package com.gielinorcompanion.exporter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.EquipmentInventorySlot;
import net.runelite.api.Item;
import net.runelite.api.ItemComposition;
import net.runelite.api.ItemContainer;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.Skill;
import net.runelite.api.WorldType;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.gameval.DBTableID;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.gameval.VarbitID;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginManager;
import net.runelite.client.plugins.timetracking.TimeTrackingPlugin;
import net.runelite.client.plugins.timetracking.Tab;
import net.runelite.client.plugins.timetracking.farming.FarmingTracker;
import net.runelite.client.plugins.timetracking.hunter.BirdHouseTracker;
import net.runelite.client.game.ItemManager;

/**
 * Reads client state into plain maps for serialization. Every method must be called on the
 * client thread; the returned maps are never touched by the client afterwards.
 */
@Slf4j
@Singleton
class SnapshotBuilder
{
	private static final String[] ACCOUNT_TYPES = {
		"normal", "ironman", "ultimate_ironman", "hardcore_ironman",
		"group_ironman", "hardcore_group_ironman", "unranked_group_ironman"
	};

	private static final String[] SLAYER_MASTERS = {
		null, "Turael", "Mazchna", "Vannaka", "Chaeldar", "Duradel", "Nieve", "Krystilia", "Konar quo Maten"
	};

	private static final int[] CA_TASK_VARPS = {
		VarPlayerID.CA_TASK_COMPLETED_0, VarPlayerID.CA_TASK_COMPLETED_1, VarPlayerID.CA_TASK_COMPLETED_2,
		VarPlayerID.CA_TASK_COMPLETED_3, VarPlayerID.CA_TASK_COMPLETED_4, VarPlayerID.CA_TASK_COMPLETED_5,
		VarPlayerID.CA_TASK_COMPLETED_6, VarPlayerID.CA_TASK_COMPLETED_7, VarPlayerID.CA_TASK_COMPLETED_8,
		VarPlayerID.CA_TASK_COMPLETED_9, VarPlayerID.CA_TASK_COMPLETED_10, VarPlayerID.CA_TASK_COMPLETED_11,
		VarPlayerID.CA_TASK_COMPLETED_12, VarPlayerID.CA_TASK_COMPLETED_13, VarPlayerID.CA_TASK_COMPLETED_14,
		VarPlayerID.CA_TASK_COMPLETED_15, VarPlayerID.CA_TASK_COMPLETED_16, VarPlayerID.CA_TASK_COMPLETED_17,
		VarPlayerID.CA_TASK_COMPLETED_18, VarPlayerID.CA_TASK_COMPLETED_19, VarPlayerID.CA_TASK_COMPLETED_20
	};

	private static final String[] CA_TIERS = {"easy", "medium", "hard", "elite", "master", "grandmaster"};
	private static final int[] CA_TIER_VARBITS = {
		VarbitID.CA_TIER_STATUS_EASY, VarbitID.CA_TIER_STATUS_MEDIUM, VarbitID.CA_TIER_STATUS_HARD,
		VarbitID.CA_TIER_STATUS_ELITE, VarbitID.CA_TIER_STATUS_MASTER, VarbitID.CA_TIER_STATUS_GRANDMASTER
	};

	@Inject
	private Client client;

	@Inject
	private ItemManager itemManager;

	@Inject
	private ConfigManager configManager;

	@Inject
	private PluginManager pluginManager;

	private Set<Integer> killVarps;

	private final Map<Integer, String> slayerNameCache = new LinkedHashMap<>();

	static boolean isCaVarp(int varpId)
	{
		if (varpId == -1)
		{
			return false;
		}
		for (int v : CA_TASK_VARPS)
		{
			if (v == varpId)
			{
				return true;
			}
		}
		return false;
	}

	String rsn()
	{
		Player p = client.getLocalPlayer();
		return p == null ? null : p.getName();
	}

	Map<String, Object> account()
	{
		Map<String, Object> m = new LinkedHashMap<>();
		int type = client.getVarbitValue(VarbitID.IRONMAN);
		m.put("rsn", rsn());
		m.put("accountType", type);
		m.put("accountTypeName", type >= 0 && type < ACCOUNT_TYPES.length ? ACCOUNT_TYPES[type] : "unknown");
		m.put("hardcoreStatusLost", client.getVarbitValue(VarbitID.IRONMAN_HARDCORE_DEAD) != 0);
		Player p = client.getLocalPlayer();
		m.put("combatLevel", p == null ? null : p.getCombatLevel());
		m.put("totalLevel", client.getTotalLevel());
		m.put("totalXp", client.getOverallExperience());
		m.put("questPoints", client.getVarpValue(VarPlayerID.QP));
		m.put("combatAchievementPoints", client.getVarbitValue(VarbitID.CA_POINTS));
		Map<String, Object> clog = new LinkedHashMap<>();
		clog.put("obtained", client.getVarpValue(VarPlayerID.COLLECTION_COUNT));
		clog.put("total", client.getVarpValue(VarPlayerID.COLLECTION_COUNT_MAX));
		m.put("collectionLog", clog);
		m.put("membersWorld", client.getWorldType().contains(WorldType.MEMBERS));
		return m;
	}

	Map<String, Object> status(boolean loggedIn)
	{
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("loggedIn", loggedIn);
		m.put("heartbeatAt", Instant.now().toString());
		if (!loggedIn)
		{
			return m;
		}
		m.put("world", client.getWorld());
		Player p = client.getLocalPlayer();
		if (p != null && p.getLocalLocation() != null)
		{
			// Inside instances, map back to the real-world tile the instance was copied from.
			WorldPoint wp = WorldPoint.fromLocalInstance(client, p.getLocalLocation());
			if (wp != null)
			{
				Map<String, Object> loc = new LinkedHashMap<>();
				loc.put("x", wp.getX());
				loc.put("y", wp.getY());
				loc.put("plane", wp.getPlane());
				loc.put("regionId", wp.getRegionID());
				loc.put("instanced", client.getTopLevelWorldView().isInstance());
				m.put("location", loc);
			}
		}
		return m;
	}

	@SuppressWarnings("deprecation") // Skill.OVERALL is deprecated but still part of Skill.values()
	Map<String, Object> skills()
	{
		List<Map<String, Object>> list = new ArrayList<>();
		for (Skill s : Skill.values())
		{
			if (s == Skill.OVERALL)
			{
				continue;
			}
			Map<String, Object> e = new LinkedHashMap<>();
			e.put("name", s.getName());
			e.put("level", client.getRealSkillLevel(s));
			e.put("boostedLevel", client.getBoostedSkillLevel(s));
			e.put("xp", client.getSkillExperience(s));
			list.add(e);
		}
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("totalLevel", client.getTotalLevel());
		m.put("totalXp", client.getOverallExperience());
		m.put("skills", list);
		return m;
	}

	/** Runs a client script per quest, so only call this when quest state may have changed. */
	Map<String, Object> quests()
	{
		List<Map<String, Object>> list = new ArrayList<>();
		int finished = 0;
		for (Quest q : Quest.values())
		{
			String state;
			try
			{
				state = q.getState(client).name();
			}
			catch (RuntimeException e)
			{
				log.debug("Quest state unavailable for {}", q, e);
				state = "UNKNOWN";
			}
			if ("FINISHED".equals(state))
			{
				finished++;
			}
			Map<String, Object> e = new LinkedHashMap<>();
			e.put("id", q.name());
			e.put("name", q.getName());
			e.put("state", state);
			list.add(e);
		}
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("questPoints", client.getVarpValue(VarPlayerID.QP));
		m.put("finished", finished);
		m.put("total", list.size());
		m.put("quests", list);
		return m;
	}

	Map<String, Object> diaries()
	{
		List<Map<String, Object>> regions = new ArrayList<>();
		int complete = 0;
		for (Diary d : Diary.values())
		{
			Map<String, Object> tiers = new LinkedHashMap<>();
			for (int i = 0; i < Diary.TIERS.length; i++)
			{
				int value = client.getVarbitValue(d.varbits[i]);
				boolean done = d.isComplete(i, value);
				if (done)
				{
					complete++;
				}
				Map<String, Object> t = new LinkedHashMap<>();
				t.put("complete", done);
				t.put("raw", value);
				t.put("tasksDone", client.getVarbitValue(d.countVarbits[i]));
				t.put("tasksTotal", d.totals[i]);
				tiers.put(Diary.TIERS[i], t);
			}
			Map<String, Object> r = new LinkedHashMap<>();
			r.put("region", d.displayName);
			r.put("tiers", tiers);
			regions.add(r);
		}
		// Raw per-task vars, decoded by the MCP server with its generated task table.
		Map<String, Integer> varps = new LinkedHashMap<>();
		for (int id : DiaryTaskVars.VARPS)
		{
			varps.put(String.valueOf(id), client.getVarpValue(id));
		}
		Map<String, Integer> varbits = new LinkedHashMap<>();
		for (int id : DiaryTaskVars.VARBITS)
		{
			varbits.put(String.valueOf(id), client.getVarbitValue(id));
		}
		Map<String, Object> taskVars = new LinkedHashMap<>();
		taskVars.put("varps", varps);
		taskVars.put("varbits", varbits);

		Map<String, Object> m = new LinkedHashMap<>();
		m.put("tiersComplete", complete);
		m.put("tiersTotal", Diary.values().length * Diary.TIERS.length);
		m.put("regions", regions);
		m.put("taskVars", taskVars);
		return m;
	}

	Map<String, Object> combatAchievements()
	{
		// Task id N is complete when bit (N % 32) of varp CA_TASK_COMPLETED_(N / 32) is set.
		List<Integer> varps = new ArrayList<>();
		List<Integer> completedIds = new ArrayList<>();
		for (int i = 0; i < CA_TASK_VARPS.length; i++)
		{
			int value = client.getVarpValue(CA_TASK_VARPS[i]);
			varps.add(value);
			for (int bit = 0; bit < 32; bit++)
			{
				if ((value & (1 << bit)) != 0)
				{
					completedIds.add(i * 32 + bit);
				}
			}
		}
		Map<String, Object> tiers = new LinkedHashMap<>();
		for (int i = 0; i < CA_TIERS.length; i++)
		{
			tiers.put(CA_TIERS[i], client.getVarbitValue(CA_TIER_VARBITS[i]));
		}
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("points", client.getVarbitValue(VarbitID.CA_POINTS));
		m.put("completedCount", completedIds.size());
		m.put("completedTaskIds", completedIds);
		m.put("tierStatusRaw", tiers);
		m.put("taskVarps", varps);
		return m;
	}

	Map<String, Object> slayer()
	{
		int taskId = client.getVarpValue(VarPlayerID.SLAYER_TARGET);
		int amount = client.getVarpValue(VarPlayerID.SLAYER_COUNT);
		int masterId = client.getVarbitValue(VarbitID.SLAYER_MASTER);
		int bossId = client.getVarbitValue(VarbitID.SLAYER_TARGET_BOSSID);

		Map<String, Object> m = new LinkedHashMap<>();
		m.put("hasTask", taskId > 0 && amount > 0);
		m.put("taskId", taskId);
		m.put("taskName", taskId > 0 ? slayerTaskName(taskId) : null);
		m.put("bossName", bossId > 0 ? slayerBossName(bossId) : null);
		m.put("amountRemaining", amount);
		m.put("initialAmount", client.getVarpValue(VarPlayerID.SLAYER_COUNT_ORIGINAL));
		m.put("konarAreaId", client.getVarpValue(VarPlayerID.SLAYER_AREA));
		m.put("masterId", masterId);
		m.put("masterName", masterId > 0 && masterId < SLAYER_MASTERS.length ? SLAYER_MASTERS[masterId] : null);
		m.put("points", client.getVarbitValue(VarbitID.SLAYER_POINTS));
		m.put("streak", client.getVarbitValue(VarbitID.SLAYER_TASKS_COMPLETED));
		m.put("wildernessStreak", client.getVarbitValue(VarbitID.SLAYER_WILDERNESS_TASKS_COMPLETED));
		return m;
	}

	Map<String, Object> container(ItemContainer container, TrackedContainer which)
	{
		List<Map<String, Object>> items = new ArrayList<>();
		long geTotal = 0;
		long haTotal = 0;
		Item[] contents = container.getItems();
		for (int slot = 0; slot < contents.length; slot++)
		{
			Item item = contents[slot];
			if (item.getId() <= 0 || item.getQuantity() <= 0)
			{
				continue;
			}
			ItemComposition comp = itemManager.getItemComposition(item.getId());
			if (comp.getPlaceholderTemplateId() != -1)
			{
				continue; // bank placeholder, not a real item
			}
			int canonical = itemManager.canonicalize(item.getId());
			long gePrice = itemManager.getItemPrice(canonical);
			int haPrice = itemManager.getItemComposition(canonical).getHaPrice();
			geTotal += gePrice * item.getQuantity();
			haTotal += (long) haPrice * item.getQuantity();

			Map<String, Object> e = new LinkedHashMap<>();
			e.put("slot", slot);
			if (which == TrackedContainer.EQUIPMENT)
			{
				e.put("equipmentSlot", equipmentSlotName(slot));
			}
			e.put("id", item.getId());
			e.put("name", CollectionLog.itemName(comp));
			e.put("quantity", item.getQuantity());
			e.put("noted", comp.getNote() != -1);
			e.put("gePrice", gePrice);
			e.put("haPrice", haPrice);
			items.add(e);
		}
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("container", which.fileName);
		m.put("itemCount", items.size());
		m.put("geValue", geTotal);
		m.put("haValue", haTotal);
		m.put("items", items);
		return m;
	}

	/**
	 * Farming and bird house timers as tracked by RuneLite's Time Tracking plugin (read-only, via its
	 * public tracker API): per patch type, whether patches are empty, growing or done, and when the
	 * last one will be ready. Marked unavailable when that plugin is disabled.
	 */
	Map<String, Object> farming()
	{
		Map<String, Object> m = new LinkedHashMap<>();
		for (Plugin p : pluginManager.getPlugins())
		{
			if (!(p instanceof TimeTrackingPlugin) || !pluginManager.isPluginEnabled(p))
			{
				continue;
			}
			try
			{
				FarmingTracker farming = p.getInjector().getInstance(FarmingTracker.class);
				Map<String, Object> types = new LinkedHashMap<>();
				for (Tab tab : Tab.FARMING_TABS)
				{
					types.put(tab.getName(), timer(String.valueOf(farming.getSummary(tab)), farming.getCompletionTime(tab)));
				}
				BirdHouseTracker birdHouses = p.getInjector().getInstance(BirdHouseTracker.class);
				m.put("available", true);
				m.put("patchTypes", types);
				m.put("birdHouses", timer(String.valueOf(birdHouses.getSummary()), birdHouses.getCompletionTime()));
				return m;
			}
			catch (RuntimeException e)
			{
				log.warn("Could not read farming timers", e);
			}
		}
		m.put("available", false);
		return m;
	}

	private static Map<String, Object> timer(String state, long doneAtEpochSeconds)
	{
		Map<String, Object> t = new LinkedHashMap<>();
		t.put("state", state);
		t.put("doneAt", doneAtEpochSeconds > 0 ? doneAtEpochSeconds : null);
		return t;
	}

	/** Varps holding boss kill counts and activity scores, from the game's own hiscores tables. */
	Set<Integer> killVarps()
	{
		if (killVarps == null)
		{
			Set<Integer> varps = new HashSet<>();
			for (int table : new int[]{DBTableID.HiscoresBossesInfo.ID, DBTableID.HiscoresActivityInfo.ID})
			{
				int col = table == DBTableID.HiscoresBossesInfo.ID ? DBTableID.HiscoresBossesInfo.COL_BOSSVARP : DBTableID.HiscoresActivityInfo.COL_ACTIVITYVARP;
				for (int row : client.getDBTableRows(table))
				{
					Object[] v = client.getDBTableField(row, col, 0);
					if (v != null && v.length > 0 && v[0] instanceof Number)
					{
						varps.add(((Number) v[0]).intValue());
					}
				}
			}
			killVarps = varps;
		}
		return killVarps;
	}

	/**
	 * Boss kill counts and activity scores straight from the game (exact, unlike the hiscores which
	 * skip low counts), plus personal bests that RuneLite's Chat Commands plugin saved (read-only).
	 */
	Map<String, Object> kills()
	{
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("bosses", readTable(DBTableID.HiscoresBossesInfo.ID, DBTableID.HiscoresBossesInfo.COL_BOSSNAME, DBTableID.HiscoresBossesInfo.COL_BOSSVARP));
		m.put("activities", readTable(DBTableID.HiscoresActivityInfo.ID, DBTableID.HiscoresActivityInfo.COL_ACTIVITYNAME, DBTableID.HiscoresActivityInfo.COL_ACTIVITYVARP));

		Map<String, Double> pbs = new TreeMap<>();
		String profile = configManager.getRSProfileKey();
		for (String key : configManager.getRSProfileConfigurationKeys("personalbest", profile, ""))
		{
			try
			{
				String value = configManager.getRSProfileConfiguration("personalbest", key);
				if (value != null)
				{
					pbs.put(key, Double.parseDouble(value));
				}
			}
			catch (NumberFormatException e)
			{
				log.debug("Ignoring personal best {}", key);
			}
		}
		m.put("personalBestsSeconds", pbs);
		return m;
	}

	private List<Map<String, Object>> readTable(int table, int nameCol, int varpCol)
	{
		List<Map<String, Object>> out = new ArrayList<>();
		for (int row : client.getDBTableRows(table))
		{
			Object[] name = client.getDBTableField(row, nameCol, 0);
			Object[] varp = client.getDBTableField(row, varpCol, 0);
			if (name == null || name.length == 0 || varp == null || varp.length == 0 || !(varp[0] instanceof Number))
			{
				continue;
			}
			Map<String, Object> e = new LinkedHashMap<>();
			e.put("name", String.valueOf(name[0]));
			e.put("count", client.getVarpValue(((Number) varp[0]).intValue()));
			out.add(e);
		}
		return out;
	}

	/** The log layout, or null if the cache data isn't as expected (the counts are still exported). */
	List<Map<String, Object>> collectionLogStructure()
	{
		try
		{
			return CollectionLog.structure(client, itemManager);
		}
		catch (RuntimeException e)
		{
			log.warn("Could not read the collection log layout", e);
			return null;
		}
	}

	private static String equipmentSlotName(int slotIdx)
	{
		for (EquipmentInventorySlot s : EquipmentInventorySlot.values())
		{
			if (s.getSlotIdx() == slotIdx)
			{
				return s.name().toLowerCase();
			}
		}
		return null;
	}

	private String slayerTaskName(int taskId)
	{
		String cached = slayerNameCache.get(taskId);
		if (cached != null)
		{
			return cached;
		}
		try
		{
			List<Integer> rows = client.getDBRowsByValue(DBTableID.SlayerTask.ID, DBTableID.SlayerTask.COL_ID, 0, taskId);
			if (rows == null || rows.isEmpty())
			{
				return null;
			}
			String name = firstString(client.getDBTableField(rows.get(0), DBTableID.SlayerTask.COL_NAME_UPPERCASE, 0));
			if (name != null)
			{
				slayerNameCache.put(taskId, name);
			}
			return name;
		}
		catch (RuntimeException e)
		{
			log.debug("Could not resolve slayer task {}", taskId, e);
			return null;
		}
	}

	private String slayerBossName(int bossId)
	{
		try
		{
			List<Integer> rows = client.getDBRowsByValue(DBTableID.SlayerTaskSublist.ID, DBTableID.SlayerTaskSublist.COL_TASK_SUBTABLE_ID, 0, bossId);
			if (rows == null || rows.isEmpty())
			{
				return null;
			}
			Object[] task = client.getDBTableField(rows.get(0), DBTableID.SlayerTaskSublist.COL_TASK, 0);
			if (task == null || task.length == 0 || !(task[0] instanceof Number))
			{
				return null;
			}
			return firstString(client.getDBTableField(((Number) task[0]).intValue(), DBTableID.SlayerTask.COL_NAME_UPPERCASE, 0));
		}
		catch (RuntimeException e)
		{
			log.debug("Could not resolve slayer boss {}", bossId, e);
			return null;
		}
	}

	private static String firstString(Object[] field)
	{
		return field == null || field.length == 0 || field[0] == null ? null : String.valueOf(field[0]);
	}
}
