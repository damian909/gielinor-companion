package com.gielinorcompanion.exporter;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/** Starts the RuneLite client with the Gielinor Companion Exporter plugin built in. */
public class CompanionLauncher
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(CompanionExporterPlugin.class);
		RuneLite.main(args);
	}
}
