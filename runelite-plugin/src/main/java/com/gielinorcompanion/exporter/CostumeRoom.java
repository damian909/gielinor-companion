package com.gielinorcompanion.exporter;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.runelite.api.Client;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.util.Text;

/**
 * Reads the player-owned house costume room interface while it is open. The game does not send the
 * furniture contents as item containers; it only draws them. Every storable item is drawn, and the
 * ones the player has stored are the ones offering "Take".
 */
final class CostumeRoom
{
	/** Window title, e.g. "Fancy Dress Box (0 / 8)"; the count in brackets is dropped. */
	private static final Pattern TITLE = Pattern.compile("^\\s*(.*?[A-Za-z].*?)\\s*(\\([^)]*\\))?\\s*$");

	static final class Snapshot
	{
		/** File name such as {@code poh_fancy_dress_box}. */
		final String fileName;
		/** Item id to quantity, in display order. */
		final Map<Integer, Integer> items;

		Snapshot(String fileName, Map<Integer, Integer> items)
		{
			this.fileName = fileName;
			this.items = items;
		}
	}

	private CostumeRoom()
	{
	}

	/** The open costume room furniture, or null when none is open. */
	static Snapshot read(Client client)
	{
		Widget list = client.getWidget(InterfaceID.PohCostumes.ITEMS);
		if (list == null || list.isHidden())
		{
			return null;
		}
		String fileName = fileName(client.getWidget(InterfaceID.PohCostumes.FRAME));
		Widget[] children = list.getDynamicChildren();
		if (fileName == null || children == null)
		{
			return null;
		}
		Map<Integer, Integer> items = new LinkedHashMap<>();
		for (Widget c : children)
		{
			if (c.getItemId() > 0 && c.getItemQuantity() > 0 && canTake(c))
			{
				items.merge(c.getItemId(), c.getItemQuantity(), Integer::sum);
			}
		}
		return new Snapshot(fileName, items);
	}

	private static boolean canTake(Widget w)
	{
		String[] actions = w.getActions();
		if (actions == null)
		{
			return false;
		}
		for (String a : actions)
		{
			if (a != null && Text.removeTags(a).equalsIgnoreCase("Take"))
			{
				return true;
			}
		}
		return false;
	}

	private static String fileName(Widget frame)
	{
		if (frame == null || frame.getDynamicChildren() == null)
		{
			return null;
		}
		for (Widget w : frame.getDynamicChildren())
		{
			String text = w.getText() == null ? "" : Text.removeTags(w.getText());
			Matcher m = TITLE.matcher(text);
			if (!text.isEmpty() && m.matches())
			{
				String slug = m.group(1).toLowerCase().replaceAll("[^a-z0-9]+", "_").replaceAll("^_+|_+$", "");
				return slug.isEmpty() ? null : "poh_" + slug;
			}
		}
		return null;
	}
}
