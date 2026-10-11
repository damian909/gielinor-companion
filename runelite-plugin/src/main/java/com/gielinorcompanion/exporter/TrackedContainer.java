package com.gielinorcompanion.exporter;

import java.util.HashMap;
import java.util.Map;
import net.runelite.api.gameval.InventoryID;

/**
 * Item containers we export. Each is written to {@code containers/<fileName>.json} only when the
 * game sends it, so storage that is only visible while open (bank, seed vault, ...) keeps its
 * last-known contents on disk.
 */
enum TrackedContainer
{
	INVENTORY(InventoryID.INV, "inventory"),
	EQUIPMENT(InventoryID.WORN, "equipment"),
	BANK(InventoryID.BANK, "bank"),
	SEED_VAULT(InventoryID.SEED_VAULT, "seed_vault"),
	LOOTING_BAG(InventoryID.LOOTING_BAG, "looting_bag"),
	SEED_BOX(InventoryID.SEED_BOX, "seed_box"),
	TACKLE_BOX(InventoryID.TACKLE_BOX, "tackle_box"),
	FORESTRY_KIT(InventoryID.FORESTRY_KIT, "forestry_kit"),
	HUNTSMANS_KIT(InventoryID.HUNTSMANS_KIT, "huntsmans_kit"),
	BOAT_1_CARGO(InventoryID.SAILING_BOAT_1_CARGOHOLD, "boat_1_cargo"),
	BOAT_2_CARGO(InventoryID.SAILING_BOAT_2_CARGOHOLD, "boat_2_cargo"),
	BOAT_3_CARGO(InventoryID.SAILING_BOAT_3_CARGOHOLD, "boat_3_cargo"),
	BOAT_4_CARGO(InventoryID.SAILING_BOAT_4_CARGOHOLD, "boat_4_cargo"),
	BOAT_5_CARGO(InventoryID.SAILING_BOAT_5_CARGOHOLD, "boat_5_cargo");

	private static final Map<Integer, TrackedContainer> BY_ID = new HashMap<>();

	static
	{
		for (TrackedContainer c : values())
		{
			BY_ID.put(c.inventoryId, c);
		}
	}

	final int inventoryId;
	final String fileName;

	TrackedContainer(int inventoryId, String fileName)
	{
		this.inventoryId = inventoryId;
		this.fileName = fileName;
	}

	static TrackedContainer byId(int inventoryId)
	{
		return BY_ID.get(inventoryId);
	}
}
