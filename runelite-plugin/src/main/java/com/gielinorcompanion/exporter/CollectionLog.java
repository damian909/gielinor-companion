package com.gielinorcompanion.exporter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.runelite.api.Client;
import net.runelite.api.EnumComposition;
import net.runelite.api.Item;
import net.runelite.api.ItemComposition;
import net.runelite.api.ItemContainer;
import net.runelite.api.StructComposition;
import net.runelite.client.game.ItemManager;

/**
 * Collection log support. The layout (tabs, pages, items) comes from the game cache, the same way
 * the game's own collection log scripts read it (see cs2 collection_draw_tab / collection_draw_log).
 * Obtained counts come from the log's search view (one collection_delayed_transmit script call per
 * obtained item), page views (the COLLECTION_TRANSMIT inventory) and new-item chat notifications.
 */
final class CollectionLog
{
	/** Enum of the top-level tab structs (Bosses, Raids, Clues, Minigames, Other). */
	private static final int TABS_ENUM = 2102;
	private static final int PARAM_TAB_NAME = 682;
	/** Tab struct param: enum of the tab's page structs. */
	private static final int PARAM_TAB_PAGES = 683;
	private static final int PARAM_PAGE_NAME = 689;
	/** Page struct param: enum of the page's item ids. */
	private static final int PARAM_PAGE_ITEMS = 690;
	/** Item id replacements the log applies before looking up counts (enum_3721 in collection_draw_log). */
	private static final int ITEM_REPLACEMENTS_ENUM = 3721;

	private CollectionLog()
	{
	}

	/** Item name without the " (Members)" suffix the game adds to members items on free-to-play worlds. */
	static String itemName(ItemComposition comp)
	{
		String name = comp.getName();
		return name.endsWith(" (Members)") ? name.substring(0, name.length() - " (Members)".length()) : name;
	}

	/** Tabs → pages → items, with names. Must run on the client thread. */
	static List<Map<String, Object>> structure(Client client, ItemManager itemManager)
	{
		Map<Integer, Integer> replacements = new HashMap<>();
		EnumComposition repl = client.getEnum(ITEM_REPLACEMENTS_ENUM);
		int[] keys = repl.getKeys();
		int[] vals = repl.getIntVals();
		for (int i = 0; i < keys.length; i++)
		{
			replacements.put(keys[i], vals[i]);
		}

		List<Map<String, Object>> tabs = new ArrayList<>();
		for (int tabStructId : client.getEnum(TABS_ENUM).getIntVals())
		{
			StructComposition tabStruct = client.getStructComposition(tabStructId);
			List<Map<String, Object>> pages = new ArrayList<>();
			for (int pageStructId : client.getEnum(tabStruct.getIntValue(PARAM_TAB_PAGES)).getIntVals())
			{
				StructComposition pageStruct = client.getStructComposition(pageStructId);
				List<Map<String, Object>> items = new ArrayList<>();
				for (int rawId : client.getEnum(pageStruct.getIntValue(PARAM_PAGE_ITEMS)).getIntVals())
				{
					int id = replacements.getOrDefault(rawId, rawId);
					Map<String, Object> item = new LinkedHashMap<>();
					item.put("id", id);
					item.put("name", itemName(itemManager.getItemComposition(id)));
					items.add(item);
				}
				Map<String, Object> page = new LinkedHashMap<>();
				page.put("name", pageStruct.getStringValue(PARAM_PAGE_NAME));
				page.put("items", items);
				pages.add(page);
			}
			Map<String, Object> tab = new LinkedHashMap<>();
			tab.put("name", tabStruct.getStringValue(PARAM_TAB_NAME));
			tab.put("pages", pages);
			tabs.add(tab);
		}
		return tabs;
	}

	/** Lower-case item name → id for every collection log item. Must run on the client thread. */
	@SuppressWarnings("unchecked")
	static Map<String, Integer> idsByName(Client client, ItemManager itemManager)
	{
		Map<String, Integer> out = new HashMap<>();
		for (Map<String, Object> tab : structure(client, itemManager))
		{
			for (Map<String, Object> page : (List<Map<String, Object>>) tab.get("pages"))
			{
				for (Map<String, Object> item : (List<Map<String, Object>>) page.get("items"))
				{
					out.putIfAbsent(String.valueOf(item.get("name")).toLowerCase(), (Integer) item.get("id"));
				}
			}
		}
		return out;
	}

	/** Item id → obtained count for every item with a positive count in the transmit inventory. */
	static Map<Integer, Integer> obtained(ItemContainer transmit)
	{
		Map<Integer, Integer> out = new LinkedHashMap<>();
		for (Item item : transmit.getItems())
		{
			if (item.getId() > 0 && item.getQuantity() > 0)
			{
				out.merge(item.getId(), item.getQuantity(), Math::max);
			}
		}
		return out;
	}
}
