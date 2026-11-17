-- Sesler. Buradaki kimlikler Roblox'un kendi içinde gelen eski ses dosyaları;
-- yer tutucu olarak iş görürler. Daha iyi silah sesleri için Creator Store'dan
-- beğendiğin sesin kimliğini (rbxassetid://...) buraya yazman yeterli.

local Sounds = {}

Sounds.Defs = {
	rifle = { id = "rbxasset://sounds/snap.mp3", volume = 0.9, speed = 0.85, range = 420 },
	smg = { id = "rbxasset://sounds/snap.mp3", volume = 0.75, speed = 1.15, range = 340 },
	lmg = { id = "rbxasset://sounds/snap.mp3", volume = 1, speed = 0.7, range = 460 },
	dmr = { id = "rbxasset://sounds/snap.mp3", volume = 1, speed = 0.6, range = 520 },
	sniper = { id = "rbxasset://sounds/Rocket shot.wav", volume = 1, speed = 1.5, range = 700 },
	shotgun = { id = "rbxasset://sounds/Rocket shot.wav", volume = 1, speed = 1.1, range = 480 },
	pistol = { id = "rbxasset://sounds/snap.mp3", volume = 0.7, speed = 1, range = 300 },
	heavy = { id = "rbxasset://sounds/snap.mp3", volume = 1, speed = 0.55, range = 380 },
	suppressed = { id = "rbxasset://sounds/clickfast.wav", volume = 0.6, speed = 0.7, range = 90 },
	knife = { id = "rbxasset://sounds/swordslash.wav", volume = 0.6, speed = 1.2, range = 60 },
	empty = { id = "rbxasset://sounds/clickfast.wav", volume = 0.5, speed = 1.3, range = 30 },
	reload = { id = "rbxasset://sounds/switch.wav", volume = 0.6, speed = 0.9, range = 40 },
	equip = { id = "rbxasset://sounds/unsheath.wav", volume = 0.35, speed = 1.4, range = 30 },
	hit = { id = "rbxasset://sounds/electronicpingshort.wav", volume = 0.45, speed = 1.6, range = 0 },
	kill = { id = "rbxasset://sounds/electronicpingshort.wav", volume = 0.7, speed = 1.0, range = 0 },
	headshot = { id = "rbxasset://sounds/electronicpingshort.wav", volume = 0.8, speed = 2.1, range = 0 },
	hurt = { id = "rbxasset://sounds/collide.wav", volume = 0.5, speed = 0.8, range = 0 },
	explosion = { id = "rbxasset://sounds/collide.wav", volume = 1, speed = 0.35, range = 600 },
	bounce = { id = "rbxasset://sounds/collide.wav", volume = 0.3, speed = 1.6, range = 80 },
	click = { id = "rbxasset://sounds/button.wav", volume = 0.4, speed = 1, range = 0 },
	capture = { id = "rbxasset://sounds/victory.wav", volume = 0.4, speed = 1.2, range = 0 },
	rankup = { id = "rbxasset://sounds/victory.wav", volume = 0.6, speed = 1, range = 0 },
}

return Sounds
