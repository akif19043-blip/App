-- Oyunun bütün ayar sayıları tek yerde. Dengeyi değiştirmek için burayı düzenle.

local Config = {}

Config.GameName = "Bozkır Harekâtı"
Config.Version = "0.1.0"

Config.Teams = {
	{
		id = "Sahin",
		name = "Şahin Birliği",
		short = "ŞAHİN",
		color = Color3.fromRGB(70, 150, 255),
		brick = "Bright blue",
		uniform = Color3.fromRGB(86, 98, 74),
	},
	{
		id = "Ejder",
		name = "Ejder Birliği",
		short = "EJDER",
		color = Color3.fromRGB(255, 104, 74),
		brick = "Bright red",
		uniform = Color3.fromRGB(132, 112, 82),
	},
}

Config.TeamById = {}
for _, team in ipairs(Config.Teams) do
	Config.TeamById[team.id] = team
end

-- Görünüm: true ise oyuncular kendi avatar kıyafetleri yerine takım üniforması giyer
-- (botlarla aynı görünür, vuruş kutuları da eşit olur)
Config.UniformAvatars = true
Config.SkinTones = {
	Color3.fromRGB(234, 184, 146),
	Color3.fromRGB(204, 142, 105),
	Color3.fromRGB(160, 110, 80),
	Color3.fromRGB(110, 76, 56),
}

-- Can
Config.MaxHealth = 100
Config.RegenDelay = 5 -- son hasardan kaç saniye sonra can dolmaya başlar
Config.RegenPerSecond = 18
Config.SpawnProtection = 3 -- doğduktan sonra dokunulmazlık (ateş edince biter)
Config.RespawnDelay = 3

-- Hareket
Config.WalkSpeed = 16
Config.SprintSpeed = 23
Config.CrouchSpeed = 8
Config.AimSpeedMult = 0.62
Config.BaseFov = 80
Config.SlideSpeed = 46
Config.SlideTime = 0.65
Config.CrouchHipDrop = 1.25

-- Tur akışı
Config.FirstIntermission = 8
Config.Intermission = 15
Config.EndScreen = 10

-- Botlar: takımlar bu sayıya kadar botla doldurulur, oyuncu geldikçe botlar çıkar
Config.FillPerTeam = 5
Config.FillFreeForAll = 8
Config.BotRespawn = 4

-- El bombası
Config.Grenades = 2
Config.GrenadeFuse = 2.6
Config.GrenadeRadius = 26
Config.GrenadeDamage = 160
Config.GrenadeSpeed = 78

-- Bıçak
Config.MeleeRange = 8.5

-- Puan (XP)
Config.Xp = {
	kill = 100,
	headshot = 50,
	assist = 50,
	longshot = 25, -- 150 metre üstü vuruş
	melee = 50,
	revenge = 25,
	capture = 150,
	neutralize = 50,
	holdTick = 10,
	win = 400,
	loss = 150,
	streak = 50, -- her 3 leşlik seride
}
Config.LongshotDistance = 150

-- Bölge Hakimiyeti
Config.CaptureRadius = 15
Config.CaptureTime = 6 -- tek kişiyle ele geçirme süresi (saniye)
Config.CaptureMaxSpeed = 3 -- en fazla kaç kişi hızlandırır

Config.DataStoreName = "BozkirProfil_v1"
Config.AutosaveInterval = 120

return Config
