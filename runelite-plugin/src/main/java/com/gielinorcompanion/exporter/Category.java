package com.gielinorcompanion.exporter;

/** One exported JSON file per category, under {@code accounts/<accountHash>/}. */
enum Category
{
	ACCOUNT("account"),
	STATUS("status"),
	SKILLS("skills"),
	QUESTS("quests"),
	DIARIES("diaries"),
	COMBAT_ACHIEVEMENTS("combat_achievements"),
	SLAYER("slayer"),
	KILLS("kills"),
	FARMING("farming");

	final String fileName;

	Category(String fileName)
	{
		this.fileName = fileName;
	}
}
