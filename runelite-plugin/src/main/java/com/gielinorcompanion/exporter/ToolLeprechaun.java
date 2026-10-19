package com.gielinorcompanion.exporter;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import net.runelite.api.Client;
import net.runelite.api.VarbitComposition;
import net.runelite.api.gameval.ItemID;
import net.runelite.api.gameval.VarbitID;

/**
 * Tool leprechaun storage, decoded from the farming tool varbits. These are player vars, so they are
 * known after login without visiting a leprechaun. Larger stores (up to 100 rakes, 1,000 buckets)
 * use "extra" varbits that we treat as the high bits of the count.
 */
final class ToolLeprechaun
{
	/** Written as {@code containers/tool_leprechaun.json}, next to the real item containers. */
	static final String FILE_NAME = "tool_leprechaun";

	private static final class Tool
	{
		final int itemId;
		final int[] varbits;

		Tool(int itemId, int... varbits)
		{
			this.itemId = itemId;
			this.varbits = varbits;
		}
	}

	private static final Tool[] COUNTED = {
		new Tool(ItemID.RAKE, VarbitID.FARMING_TOOLS_RAKE, VarbitID.FARMING_TOOLS_EXTRARAKES),
		new Tool(ItemID.DIBBER, VarbitID.FARMING_TOOLS_DIBBER, VarbitID.FARMING_TOOLS_EXTRADIBBERS),
		new Tool(ItemID.SPADE, VarbitID.FARMING_TOOLS_SPADE, VarbitID.FARMING_TOOLS_EXTRASPADES),
		new Tool(ItemID.GARDENING_TROWEL, VarbitID.FARMING_TOOLS_TROWEL, VarbitID.FARMING_TOOLS_EXTRATROWELS),
		new Tool(ItemID.BUCKET_EMPTY, VarbitID.FARMING_TOOLS_BUCKETS, VarbitID.FARMING_TOOLS_EXTRABUCKETS, VarbitID.FARMING_TOOLS_EXTRA2BUCKETS),
		new Tool(ItemID.BUCKET_COMPOST, VarbitID.FARMING_TOOLS_COMPOST, VarbitID.FARMING_TOOLS_EXTRACOMPOST),
		new Tool(ItemID.BUCKET_SUPERCOMPOST, VarbitID.FARMING_TOOLS_SUPERCOMPOST, VarbitID.FARMING_TOOLS_EXTRASUPERCOMPOST),
		new Tool(ItemID.BUCKET_ULTRACOMPOST, VarbitID.FARMING_TOOLS_ULTRACOMPOST),
		new Tool(ItemID.PLANT_CURE, VarbitID.FARMING_TOOLS_PLANTCURE),
	};

	private static final int[] SECATEURS_VARBITS = {VarbitID.FARMING_TOOLS_SECATEURS, VarbitID.FARMING_TOOLS_EXTRASECATEURS};

	/** Assumed: watering can state 1..9 is a watering can with 0..8 doses. */
	private static final int[] WATERING_CANS = {
		ItemID.WATERING_CAN_0, ItemID.WATERING_CAN_1, ItemID.WATERING_CAN_2, ItemID.WATERING_CAN_3,
		ItemID.WATERING_CAN_4, ItemID.WATERING_CAN_5, ItemID.WATERING_CAN_6, ItemID.WATERING_CAN_7, ItemID.WATERING_CAN_8
	};

	/** Every varbit read here, by name, so the raw values can be exported for checking the decoding. */
	private static final Map<String, Integer> RAW = new LinkedHashMap<>();

	static
	{
		RAW.put("rake", VarbitID.FARMING_TOOLS_RAKE);
		RAW.put("extraRakes", VarbitID.FARMING_TOOLS_EXTRARAKES);
		RAW.put("dibber", VarbitID.FARMING_TOOLS_DIBBER);
		RAW.put("extraDibbers", VarbitID.FARMING_TOOLS_EXTRADIBBERS);
		RAW.put("spade", VarbitID.FARMING_TOOLS_SPADE);
		RAW.put("extraSpades", VarbitID.FARMING_TOOLS_EXTRASPADES);
		RAW.put("secateurs", VarbitID.FARMING_TOOLS_SECATEURS);
		RAW.put("extraSecateurs", VarbitID.FARMING_TOOLS_EXTRASECATEURS);
		RAW.put("fairySecateurs", VarbitID.FARMING_TOOLS_FAIRYSECATEURS);
		RAW.put("trowel", VarbitID.FARMING_TOOLS_TROWEL);
		RAW.put("extraTrowels", VarbitID.FARMING_TOOLS_EXTRATROWELS);
		RAW.put("wateringCan", VarbitID.FARMING_TOOLS_WATERINGCAN);
		RAW.put("buckets", VarbitID.FARMING_TOOLS_BUCKETS);
		RAW.put("extraBuckets", VarbitID.FARMING_TOOLS_EXTRABUCKETS);
		RAW.put("extra2Buckets", VarbitID.FARMING_TOOLS_EXTRA2BUCKETS);
		RAW.put("compost", VarbitID.FARMING_TOOLS_COMPOST);
		RAW.put("extraCompost", VarbitID.FARMING_TOOLS_EXTRACOMPOST);
		RAW.put("supercompost", VarbitID.FARMING_TOOLS_SUPERCOMPOST);
		RAW.put("extraSupercompost", VarbitID.FARMING_TOOLS_EXTRASUPERCOMPOST);
		RAW.put("ultracompost", VarbitID.FARMING_TOOLS_ULTRACOMPOST);
		RAW.put("plantCure", VarbitID.FARMING_TOOLS_PLANTCURE);
		RAW.put("bottomlessBucketType", VarbitID.FARMING_TOOLS_BOTTOMLESS_BUCKET_TYPE);
		RAW.put("bottomlessBucketQuantity", VarbitID.FARMING_TOOLS_BOTTOMLESS_BUCKET_QUANTITY);
	}

	private static final Set<Integer> VARBITS = new HashSet<>(RAW.values());

	private ToolLeprechaun()
	{
	}

	static boolean isToolVarbit(int varbitId)
	{
		return VARBITS.contains(varbitId);
	}

	/** Item id to stored quantity, in a stable order. */
	static Map<Integer, Integer> contents(Client client)
	{
		Map<Integer, Integer> items = new LinkedHashMap<>();
		for (Tool tool : COUNTED)
		{
			put(items, tool.itemId, count(client, tool.varbits));
		}
		boolean magic = client.getVarbitValue(VarbitID.FARMING_TOOLS_FAIRYSECATEURS) > 0;
		put(items, magic ? ItemID.FAIRY_ENCHANTED_SECATEURS : ItemID.SECATEURS, count(client, SECATEURS_VARBITS));
		int can = client.getVarbitValue(VarbitID.FARMING_TOOLS_WATERINGCAN);
		if (can >= 1 && can <= WATERING_CANS.length)
		{
			put(items, WATERING_CANS[can - 1], 1);
		}
		if (client.getVarbitValue(VarbitID.FARMING_TOOLS_BOTTOMLESS_BUCKET_TYPE) > 0)
		{
			put(items, ItemID.BOTTOMLESS_COMPOST_BUCKET, 1);
		}
		return items;
	}

	static Map<String, Integer> raw(Client client)
	{
		Map<String, Integer> m = new LinkedHashMap<>();
		for (Map.Entry<String, Integer> e : RAW.entrySet())
		{
			m.put(e.getKey(), client.getVarbitValue(e.getValue()));
		}
		return m;
	}

	/** Each later varbit supplies the next higher bits of the count. */
	private static int count(Client client, int[] varbits)
	{
		int total = 0;
		int shift = 0;
		for (int varbit : varbits)
		{
			total += client.getVarbitValue(varbit) << shift;
			VarbitComposition def = client.getVarbit(varbit);
			if (def == null)
			{
				break;
			}
			shift += def.getMostSignificantBit() - def.getLeastSignificantBit() + 1;
		}
		return total;
	}

	private static void put(Map<Integer, Integer> items, int itemId, int quantity)
	{
		if (quantity > 0)
		{
			items.put(itemId, quantity);
		}
	}
}
