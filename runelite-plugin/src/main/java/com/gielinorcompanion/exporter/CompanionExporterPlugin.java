package com.gielinorcompanion.exporter;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.api.events.ChatMessage;
import net.runelite.client.game.ItemManager;
import net.runelite.client.util.Text;
import net.runelite.api.GameState;
import net.runelite.api.ItemContainer;
import net.runelite.api.ScriptID;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GameTick;
import net.runelite.api.events.ItemContainerChanged;
import net.runelite.api.events.ScriptPostFired;
import net.runelite.api.events.ScriptPreFired;
import net.runelite.api.events.StatChanged;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.gameval.InventoryID;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.gameval.VarbitID;
import net.runelite.client.config.RuneScapeProfileType;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;

/**
 * Read-only exporter: listens to game events and writes the player's own account state to JSON
 * files for local tools. It never sends anything to the game or the network.
 */
@Slf4j
@PluginDescriptor(
	name = "Gielinor Companion Exporter",
	description = "Exports your own account data to local JSON files",
	tags = {"export", "json", "account"},
	internalName = "gielinorcompanion"
)
public class CompanionExporterPlugin extends Plugin
{
	static final String VERSION = "0.8.0";

	/** Wait a few ticks after login so varps and containers are populated. */
	private static final int LOGIN_DELAY_TICKS = 5;
	/** Write changed categories at most every ~3 seconds. */
	private static final int FLUSH_INTERVAL_TICKS = 5;
	/** Rewrite status.json (location, world) about once a minute. */
	private static final int HEARTBEAT_TICKS = 100;
	/** Quest states need a client script per quest, so re-check at most every ~2 minutes. */
	private static final int QUEST_RECHECK_TICKS = 200;
	/** Refresh farming timers about every 5 minutes (they are absolute times, so this is plenty). */
	private static final int FARMING_TICKS = 500;

	@Inject
	private Client client;

	@Inject
	private SnapshotBuilder snapshots;

	@Inject
	private ExportWriter writer;

	@Inject
	private RouteRequests routeRequests;

	private final EnumSet<Category> dirty = EnumSet.noneOf(Category.class);
	private final Map<TrackedContainer, Map<String, Object>> pendingContainers = new EnumMap<>(TrackedContainer.class);

	/** -1 while logged out. */
	private int ticksSinceLogin = -1;
	private int ticksSinceFlush;
	private int ticksSinceHeartbeat;
	private int ticksSinceQuestCheck;
	private int ticksSinceFarming;
	private boolean questsMaybeChanged;
	private boolean toolsChanged;
	/** Last costume room contents written, so an open interface is only re-written when it changes. */
	private Map<Integer, Integer> lastCostumeItems;
	private String lastCostumeFile;
	private AccountKey account;
	/** Collection log counts seen since the last flush; null if none. */
	private Map<Integer, Integer> pendingClog;
	/** The log layout only needs writing once per session (it changes with game updates). */
	private boolean clogStructureWritten;
	/** Lower-case collection log item name to item id, built on first use. */
	private Map<String, Integer> clogIdsByName;

	/** cs2 clientscript collection_delayed_transmit: one call per obtained item in the log's search view. */
	private static final int SCRIPT_COLLECTION_DELAYED_TRANSMIT = 4100;
	/** cs2 proc collection_draw_log: draws a log page from the COLLECTION_TRANSMIT inventory. */
	private static final int SCRIPT_COLLECTION_DRAW_LOG = 2732;

	private static final Pattern NEW_CLOG_ITEM = Pattern.compile("New item added to your collection log: (.+)");

	@Inject
	private ItemManager itemManager;

	@Override
	protected void startUp() throws Exception
	{
		writer.start(getPluginDirectory());
		routeRequests.start(getPluginDirectory());
		if (client.getGameState() == GameState.LOGGED_IN)
		{
			beginSession();
		}
		log.info("Gielinor Companion Exporter started");
	}

	@Override
	protected void shutDown() throws Exception
	{
		routeRequests.stop();
		endSession();
		writer.stop();
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged event)
	{
		switch (event.getGameState())
		{
			case LOGGED_IN:
				if (ticksSinceLogin < 0)
				{
					beginSession();
				}
				break;
			case LOGIN_SCREEN:
			case HOPPING:
			case CONNECTION_LOST:
				endSession();
				break;
			default:
				break;
		}
	}

	@Subscribe
	public void onGameTick(GameTick tick)
	{
		if (ticksSinceLogin < 0)
		{
			return;
		}
		ticksSinceLogin++;

		if (account == null)
		{
			if (ticksSinceLogin < LOGIN_DELAY_TICKS || !resolveAccount())
			{
				return;
			}
			// First full snapshot of this session.
			dirty.addAll(EnumSet.allOf(Category.class));
			toolsChanged = true;
			captureLive(TrackedContainer.INVENTORY);
			captureLive(TrackedContainer.EQUIPMENT);
			flush();
			return;
		}

		if (++ticksSinceHeartbeat >= HEARTBEAT_TICKS)
		{
			dirty.add(Category.STATUS);
		}
		if (++ticksSinceFarming >= FARMING_TICKS)
		{
			ticksSinceFarming = 0;
			dirty.add(Category.FARMING);
		}
		if (questsMaybeChanged && ++ticksSinceQuestCheck >= QUEST_RECHECK_TICKS)
		{
			dirty.add(Category.QUESTS);
		}
		captureCostumeRoom();
		if (++ticksSinceFlush >= FLUSH_INTERVAL_TICKS)
		{
			flush();
		}
	}

	@Subscribe
	public void onStatChanged(StatChanged event)
	{
		if (account != null)
		{
			dirty.add(Category.SKILLS);
			dirty.add(Category.ACCOUNT);
		}
	}

	@Subscribe
	public void onVarbitChanged(VarbitChanged event)
	{
		if (account == null)
		{
			return;
		}
		int varp = event.getVarpId();
		int varbit = event.getVarbitId();

		if (varp == VarPlayerID.QP)
		{
			dirty.add(Category.QUESTS);
			dirty.add(Category.ACCOUNT);
		}
		else
		{
			// Quest progress is stored in many different vars; re-check periodically.
			questsMaybeChanged = true;
		}
		if (Diary.isDiaryVar(varp, varbit))
		{
			dirty.add(Category.DIARIES);
		}
		if (SnapshotBuilder.isCaVarp(varp) || varbit == VarbitID.CA_POINTS)
		{
			dirty.add(Category.COMBAT_ACHIEVEMENTS);
			dirty.add(Category.ACCOUNT);
		}
		if (varp == VarPlayerID.SLAYER_TARGET || varp == VarPlayerID.SLAYER_COUNT
			|| varbit == VarbitID.SLAYER_POINTS || varbit == VarbitID.SLAYER_TASKS_COMPLETED)
		{
			dirty.add(Category.SLAYER);
		}
		if (varp != -1 && snapshots.killVarps().contains(varp))
		{
			dirty.add(Category.KILLS);
		}
		if (varp == VarPlayerID.COLLECTION_COUNT || varbit == VarbitID.IRONMAN)
		{
			dirty.add(Category.ACCOUNT);
		}
		if (ToolLeprechaun.isToolVarbit(varbit))
		{
			toolsChanged = true;
		}
	}

	@Subscribe
	public void onItemContainerChanged(ItemContainerChanged event)
	{
		if (event.getContainerId() == InventoryID.COLLECTION_TRANSMIT)
		{
			captureCollectionLog(event.getItemContainer());
			return;
		}
		TrackedContainer which = TrackedContainer.byId(event.getContainerId());
		if (which == null || ticksSinceLogin < 0)
		{
			return;
		}
		// Build the snapshot now: some containers are only readable while their interface is open.
		pendingContainers.put(which, snapshots.container(event.getItemContainer(), which));
	}

	/**
	 * Collection log search view: the server runs clientscript collection_delayed_transmit once per
	 * obtained item, with arguments (item, count, ?, page struct). Same hook WikiSync uses.
	 */
	@Subscribe
	public void onScriptPreFired(ScriptPreFired event)
	{
		if (event.getScriptId() != SCRIPT_COLLECTION_DELAYED_TRANSMIT || account == null || event.getScriptEvent() == null)
		{
			return;
		}
		Object[] args = event.getScriptEvent().getArguments();
		if (args != null && args.length > 2 && args[1] instanceof Integer && args[2] instanceof Integer)
		{
			int itemId = (Integer) args[1];
			int count = (Integer) args[2];
			if (itemId > 0 && count > 0)
			{
				addClogItems(Map.of(itemId, count));
			}
		}
	}

	/** Collection log page view: after the page is drawn, its counts are in the transmit inventory. */
	@Subscribe
	public void onScriptPostFired(ScriptPostFired event)
	{
		if (event.getScriptId() == SCRIPT_COLLECTION_DRAW_LOG || event.getScriptId() == ScriptID.COLLECTION_DRAW_LIST)
		{
			ItemContainer transmit = client.getItemContainer(InventoryID.COLLECTION_TRANSMIT);
			if (transmit != null)
			{
				captureCollectionLog(transmit);
			}
		}
	}

	/**
	 * Records new collection log items as they happen, from the game's own notification (needs the
	 * in-game setting "Collection log - New addition notification" set to a chat message).
	 */
	@Subscribe
	public void onChatMessage(ChatMessage event)
	{
		if (account == null || event.getType() != ChatMessageType.GAMEMESSAGE)
		{
			return;
		}
		// Personal bests are saved by RuneLite's Chat Commands plugin from these messages.
		if (event.getMessage().contains("personal best") || event.getMessage().contains("Fastest"))
		{
			dirty.add(Category.KILLS);
		}
		Matcher m = NEW_CLOG_ITEM.matcher(Text.removeTags(event.getMessage()));
		if (!m.matches())
		{
			return;
		}
		if (clogIdsByName == null)
		{
			clogIdsByName = CollectionLog.idsByName(client, itemManager);
		}
		Integer id = clogIdsByName.get(m.group(1).trim().toLowerCase());
		if (id == null)
		{
			log.debug("Collection log item not recognised: {}", m.group(1));
			return;
		}
		addClogItems(Map.of(id, 1));
	}

	/** Costume room furniture is only readable while its interface is open; write it when it changes. */
	private void captureCostumeRoom()
	{
		CostumeRoom.Snapshot room = CostumeRoom.read(client);
		if (room == null)
		{
			lastCostumeFile = null;
			lastCostumeItems = null;
			return;
		}
		if (room.fileName.equals(lastCostumeFile) && room.items.equals(lastCostumeItems))
		{
			return;
		}
		lastCostumeFile = room.fileName;
		lastCostumeItems = room.items;
		writer.writeContainer(account, room.fileName, snapshots.storage(room.fileName, room.items));
	}

	private void captureCollectionLog(ItemContainer transmit)
	{
		if (account != null)
		{
			addClogItems(CollectionLog.obtained(transmit));
		}
	}

	/** Queues obtained counts for the next flush; a newer count for the same item replaces the older. */
	private void addClogItems(Map<Integer, Integer> items)
	{
		if (items.isEmpty())
		{
			return;
		}
		if (pendingClog == null)
		{
			pendingClog = new LinkedHashMap<>();
		}
		pendingClog.putAll(items);
	}

	private void beginSession()
	{
		ticksSinceLogin = 0;
		ticksSinceFlush = 0;
		ticksSinceHeartbeat = 0;
		ticksSinceQuestCheck = 0;
		questsMaybeChanged = false;
		toolsChanged = false;
		account = null;
		dirty.clear();
		pendingContainers.clear();
		pendingClog = null;
		clogStructureWritten = false;
		clogIdsByName = null;
	}

	/** On logout only already-built snapshots are written: client state is being torn down. */
	private void endSession()
	{
		if (account != null)
		{
			writeContainers();
			if (pendingClog != null)
			{
				writer.mergeCollectionLog(account, pendingClog, false, 0, 0, null);
			}
			writer.writeCategory(account, Category.STATUS.fileName, snapshots.status(false));
		}
		ticksSinceLogin = -1;
		account = null;
		dirty.clear();
		pendingContainers.clear();
		pendingClog = null;
	}

	private boolean resolveAccount()
	{
		long hash = client.getAccountHash();
		String rsn = snapshots.rsn();
		if (hash == -1 || rsn == null)
		{
			return false;
		}
		RuneScapeProfileType type = RuneScapeProfileType.getCurrent(client);
		account = new AccountKey(hash, type.name().toLowerCase(), rsn);
		log.debug("Exporting account {} ({})", rsn, account.key());
		return true;
	}

	private void captureLive(TrackedContainer which)
	{
		ItemContainer c = client.getItemContainer(which.inventoryId);
		if (c != null)
		{
			pendingContainers.put(which, snapshots.container(c, which));
		}
	}

	private void flush()
	{
		ticksSinceFlush = 0;
		if (account == null)
		{
			return;
		}
		for (Category category : dirty)
		{
			Map<String, Object> data = build(category);
			writer.writeCategory(account, category.fileName, data);
			if (category == Category.ACCOUNT)
			{
				writer.updateIndex(account, data);
			}
		}
		if (dirty.contains(Category.STATUS))
		{
			ticksSinceHeartbeat = 0;
		}
		if (dirty.contains(Category.QUESTS))
		{
			ticksSinceQuestCheck = 0;
			questsMaybeChanged = false;
		}
		dirty.clear();
		writeContainers();
		if (toolsChanged)
		{
			writer.writeContainer(account, ToolLeprechaun.FILE_NAME, snapshots.toolLeprechaun());
			toolsChanged = false;
		}
		if (pendingClog != null)
		{
			int obtainedCount = client.getVarpValue(VarPlayerID.COLLECTION_COUNT);
			// Seeing every obtained item in one go (the search view) means the stored set can be replaced.
			boolean complete = obtainedCount > 0 && pendingClog.size() >= obtainedCount;
			writer.mergeCollectionLog(account, pendingClog, complete,
				obtainedCount, client.getVarpValue(VarPlayerID.COLLECTION_COUNT_MAX),
				clogStructureWritten ? null : snapshots.collectionLogStructure());
			clogStructureWritten = true;
			pendingClog = null;
		}
	}

	private void writeContainers()
	{
		for (Map.Entry<TrackedContainer, Map<String, Object>> e : pendingContainers.entrySet())
		{
			writer.writeContainer(account, e.getKey().fileName, e.getValue());
		}
		pendingContainers.clear();
	}

	private Map<String, Object> build(Category category)
	{
		switch (category)
		{
			case ACCOUNT:
				return snapshots.account();
			case STATUS:
				return snapshots.status(true);
			case SKILLS:
				return snapshots.skills();
			case QUESTS:
				return snapshots.quests();
			case DIARIES:
				return snapshots.diaries();
			case COMBAT_ACHIEVEMENTS:
				return snapshots.combatAchievements();
			case SLAYER:
				return snapshots.slayer();
			case KILLS:
				return snapshots.kills();
			case FARMING:
				return snapshots.farming();
			default:
				throw new IllegalArgumentException(category.name());
		}
	}
}
