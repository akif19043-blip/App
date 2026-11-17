-- Menü: teçhizat seçimi, profil ve rütbe, "Savaşa Katıl" düğmesi, ölüm ekranı
-- ve tur sonucu. Oyuncu sahada değilken açıktır.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Attachments = require(Shared.Attachments)
local Config = require(Shared.Config)
local GunModels = require(Shared.GunModels)
local Loadout = require(Shared.Loadout)
local Ranks = require(Shared.Ranks)
local Weapons = require(Shared.Weapons)

local Ui = require(script.Parent.Ui)

local Menu = {}

local C = Ui.Colors
local make, label, frame, button = Ui.make, Ui.label, Ui.frame, Ui.button

local gui
local refs = {}
local callbacks = {}
local profile = {
	xp = 0,
	rank = 1,
	kills = 0,
	deaths = 0,
	headshots = 0,
	wins = 0,
	matches = 0,
	weaponKills = {},
	loadout = Loadout.Default,
}
local loadout = { primary = "bora", secondary = "akrep", attachments = {} }
local selected = "bora"
local weaponButtons = {}
local open = false
local deployEnabled = false
local saveQueued = false

local FIRE_MODE = { auto = "Otomatik", semi = "Tek atış", burst = "Üçlü atış" }
Menu.FireModeText = FIRE_MODE

local function copyLoadout(source)
	local result = { primary = source.primary, secondary = source.secondary, attachments = {} }
	for weaponId, slots in pairs(source.attachments or {}) do
		result.attachments[weaponId] = table.clone(slots)
	end
	return result
end

local function queueSave()
	if saveQueued then
		return
	end
	saveQueued = true
	task.delay(0.4, function()
		saveQueued = false
		if callbacks.setLoadout then
			callbacks.setLoadout(copyLoadout(loadout))
		end
	end)
end

-- Silah istatistiklerini 0..1 aralığında çubuklara çevirir
function Menu.statBars(stats)
	local pellets = math.min(stats.pellets, 4)
	return {
		{ "Hasar", math.clamp(stats.damage * pellets / 92, 0.05, 1) },
		{ "Atış hızı", math.clamp(stats.rpm / 1000, 0.05, 1) },
		{ "Menzil", math.clamp(stats.falloffEnd / 600, 0.05, 1) },
		{ "İsabet", math.clamp(1 - (stats.hipSpread * 0.4 + stats.adsSpread * 2) / 5, 0.05, 1) },
		{ "Kontrol", math.clamp(1 - (stats.recoilV + stats.recoilH) / 6.5, 0.05, 1) },
		{ "Hareket", math.clamp((stats.speedMult - 0.82) / 0.3, 0.05, 1) },
	}
end

local function sectionTitle(text, parent, order)
	return label({
		Size = UDim2.new(1, 0, 0, 22),
		Text = text,
		TextSize = 12,
		TextColor3 = C.accent,
		LayoutOrder = order,
		Parent = parent,
	})
end

local function buildWeaponList(parent)
	local list = make("ScrollingFrame", {
		Name = "Weapons",
		Position = UDim2.fromOffset(0, 0),
		Size = UDim2.new(0, 250, 1, 0),
		BackgroundColor3 = C.panel,
		BackgroundTransparency = 0.1,
		BorderSizePixel = 0,
		ScrollBarThickness = 4,
		ScrollBarImageColor3 = C.line,
		CanvasSize = UDim2.fromOffset(0, 0),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollingDirection = Enum.ScrollingDirection.Y,
		Parent = parent,
	}, { Ui.corner(8), Ui.pad(10), Ui.list(Enum.FillDirection.Vertical, 4) })

	local order = 0
	local function add(ids, title)
		order += 1
		sectionTitle(title, list, order)
		for _, id in ipairs(ids) do
			local def = Weapons.Defs[id]
			order += 1
			local b = button({
				Name = id,
				LayoutOrder = order,
				Size = UDim2.new(1, -4, 0, 38),
				BackgroundColor3 = C.panel2,
				Parent = list,
			}, { Ui.corner(5) })
			local nameLabel = label({
				Position = UDim2.fromOffset(10, 3),
				Size = UDim2.new(1, -20, 0, 18),
				Text = def.name,
				TextSize = 15,
				Parent = b,
			})
			local info = label({
				Position = UDim2.fromOffset(10, 20),
				Size = UDim2.new(1, -20, 0, 14),
				Text = def.classLabel,
				TextSize = 11,
				TextColor3 = C.dim,
				Font = Ui.FontMedium,
				Parent = b,
			})
			local tag = label({
				AnchorPoint = Vector2.new(1, 0),
				Position = UDim2.new(1, -10, 0, 3),
				Size = UDim2.fromOffset(90, 18),
				TextXAlignment = Enum.TextXAlignment.Right,
				TextSize = 11,
				Text = "",
				Parent = b,
			})
			local stroke = Ui.stroke(C.accent, 2, 1)
			stroke.Parent = b
			b.Activated:Connect(function()
				selected = id
				if Loadout.weaponUnlocked(profile, id) then
					if def.slot == "primary" then
						loadout.primary = id
					else
						loadout.secondary = id
					end
					queueSave()
				end
				Menu.refresh()
			end)
			weaponButtons[id] = { button = b, name = nameLabel, info = info, tag = tag, stroke = stroke }
		end
	end
	add(Weapons.Primaries, "ANA SİLAH")
	add(Weapons.Secondaries, "YAN SİLAH")
	return list
end

local function buildDetail(parent)
	local detail = frame({
		Name = "Detail",
		Position = UDim2.fromOffset(262, 0),
		Size = UDim2.new(0, 430, 1, 0),
		BackgroundTransparency = 0.1,
		Parent = parent,
	}, { Ui.corner(8), Ui.pad(14) })
	-- Seçili silahın dönen 3B görünümü
	local viewport = make("ViewportFrame", {
		Name = "Preview",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromOffset(196, 80),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.35,
		Ambient = Color3.fromRGB(150, 148, 140),
		LightColor = Color3.fromRGB(255, 244, 226),
		LightDirection = Vector3.new(-0.6, -1, -0.8),
		Parent = detail,
	}, { Ui.corner(6) })
	local previewCamera = make("Camera", { FieldOfView = 30, Parent = viewport })
	viewport.CurrentCamera = previewCamera
	refs.preview = {
		viewport = viewport,
		world = make("WorldModel", { Parent = viewport }),
		camera = previewCamera,
	}
	refs.detailName = label({ Size = UDim2.new(1, -204, 0, 28), TextSize = 26, Font = Ui.FontBlack, Parent = detail })
	refs.detailClass = label({
		Position = UDim2.fromOffset(0, 28),
		Size = UDim2.new(1, -204, 0, 18),
		TextWrapped = true,
		TextSize = 13,
		TextColor3 = C.accent,
		Parent = detail,
	})
	refs.detailText = label({
		Position = UDim2.fromOffset(0, 48),
		Size = UDim2.new(1, -204, 0, 34),
		TextSize = 13,
		TextColor3 = C.dim,
		Font = Ui.FontMedium,
		TextWrapped = true,
		TextYAlignment = Enum.TextYAlignment.Top,
		Parent = detail,
	})
	refs.bars = {}
	for index = 1, 6 do
		local y = 86 + (index - 1) * 22
		local name = label({
			Position = UDim2.fromOffset(0, y),
			Size = UDim2.fromOffset(90, 18),
			TextSize = 12,
			TextColor3 = C.dim,
			Parent = detail,
		})
		local track = frame({
			Position = UDim2.fromOffset(96, y + 6),
			Size = UDim2.new(1, -150, 0, 6),
			BackgroundColor3 = C.ink,
			Parent = detail,
		}, { Ui.corner(3) })
		local fill = frame(
			{ Size = UDim2.fromScale(0.5, 1), BackgroundColor3 = C.text, Parent = track },
			{ Ui.corner(3) }
		)
		local value = label({
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, 0, 0, y),
			Size = UDim2.fromOffset(46, 18),
			TextXAlignment = Enum.TextXAlignment.Right,
			TextSize = 12,
			Parent = detail,
		})
		refs.bars[index] = { name = name, fill = fill, value = value }
	end
	refs.detailFacts = label({
		Position = UDim2.fromOffset(0, 220),
		Size = UDim2.new(1, 0, 0, 18),
		TextSize = 12,
		TextColor3 = C.dim,
		Font = Ui.FontMedium,
		Parent = detail,
	})
	refs.attachTitle = label({
		Position = UDim2.fromOffset(0, 246),
		Size = UDim2.new(1, 0, 0, 18),
		TextSize = 12,
		TextColor3 = C.accent,
		Text = "EKLENTİLER",
		Parent = detail,
	})
	refs.slots = {}
	for index, slot in ipairs(Attachments.Slots) do
		local y = 268 + (index - 1) * 40
		local name = label({
			Position = UDim2.fromOffset(0, y + 6),
			Size = UDim2.fromOffset(78, 18),
			TextSize = 12,
			TextColor3 = C.dim,
			Text = Attachments.SlotNames[slot],
			Parent = detail,
		})
		local row = frame({
			Position = UDim2.fromOffset(80, y),
			Size = UDim2.new(1, -80, 0, 32),
			BackgroundTransparency = 1,
			Parent = detail,
		}, { Ui.list(Enum.FillDirection.Horizontal, 6) })
		refs.slots[slot] = { name = name, row = row }
	end
	refs.attachInfo = label({
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.fromScale(0, 1),
		Size = UDim2.new(1, 0, 0, 30),
		TextSize = 12,
		TextColor3 = C.dim,
		Font = Ui.FontMedium,
		TextWrapped = true,
		Parent = detail,
	})
	refs.detail = detail
end

local function buildSide(parent)
	local side = frame({
		Name = "Side",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0, 272, 1, 0),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	local card = frame(
		{ Size = UDim2.new(1, 0, 0, 176), BackgroundTransparency = 0.1, Parent = side },
		{ Ui.corner(8), Ui.pad(14) }
	)
	refs.rankNumber = label({
		Size = UDim2.fromOffset(52, 52),
		BackgroundTransparency = 0,
		BackgroundColor3 = C.accent,
		TextColor3 = C.ink,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 26,
		Font = Ui.FontBlack,
		Parent = card,
	}, { Ui.corner(6) })
	refs.rankName = label({
		Position = UDim2.fromOffset(64, 4),
		Size = UDim2.new(1, -64, 0, 24),
		TextSize = 20,
		Font = Ui.FontBlack,
		Parent = card,
	})
	refs.rankNext = label({
		Position = UDim2.fromOffset(64, 28),
		Size = UDim2.new(1, -64, 0, 18),
		TextSize = 12,
		TextColor3 = C.dim,
		Font = Ui.FontMedium,
		Parent = card,
	})
	local track = frame(
		{ Position = UDim2.fromOffset(0, 62), Size = UDim2.new(1, 0, 0, 8), BackgroundColor3 = C.ink, Parent = card },
		{ Ui.corner(4) }
	)
	refs.xpFill = frame({ Size = UDim2.fromScale(0, 1), BackgroundColor3 = C.accent, Parent = track }, { Ui.corner(4) })
	refs.stats = label({
		Position = UDim2.fromOffset(0, 80),
		Size = UDim2.new(1, 0, 0, 66),
		TextSize = 13,
		Font = Ui.FontMedium,
		TextYAlignment = Enum.TextYAlignment.Top,
		RichText = true,
		LineHeight = 1.25,
		Parent = card,
	})

	local info = frame({
		Position = UDim2.fromOffset(0, 188),
		Size = UDim2.new(1, 0, 1, -276),
		BackgroundTransparency = 0.1,
		Parent = side,
	}, { Ui.corner(8), Ui.pad(14) })
	refs.infoTitle = label({
		Size = UDim2.new(1, 0, 0, 20),
		TextSize = 16,
		Font = Ui.FontBlack,
		TextColor3 = C.accent,
		Parent = info,
	})
	refs.infoText = label({
		Position = UDim2.fromOffset(0, 24),
		Size = UDim2.new(1, 0, 1, -24),
		TextSize = 13,
		Font = Ui.FontMedium,
		TextWrapped = true,
		TextYAlignment = Enum.TextYAlignment.Top,
		RichText = true,
		Parent = info,
	})

	local deploy = button({
		Name = "Deploy",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.fromScale(0, 1),
		Size = UDim2.new(1, 0, 0, 76),
		BackgroundColor3 = C.accent,
		TextColor3 = C.ink,
		TextSize = 26,
		Font = Ui.FontBlack,
		Text = "SAVAŞA KATIL",
		Parent = side,
	}, { Ui.corner(8) })
	refs.deploySub = label({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -6),
		Size = UDim2.new(1, -20, 0, 16),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 12,
		TextColor3 = C.ink,
		Font = Ui.FontMedium,
		Parent = deploy,
	})
	deploy.Activated:Connect(function()
		if deployEnabled and callbacks.deploy then
			callbacks.deploy()
		end
	end)
	refs.deploy = deploy
end

local function buildDeath(canvas)
	local death = frame({
		Name = "Death",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -40),
		Size = UDim2.fromOffset(520, 96),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.2,
		Visible = false,
		Parent = canvas,
	}, { Ui.corner(8), Ui.stroke(C.bad, 2, 0.3) })
	label({
		Position = UDim2.fromOffset(0, 10),
		Size = UDim2.new(1, 0, 0, 28),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 24,
		Font = Ui.FontBlack,
		TextColor3 = C.bad,
		Text = "ETKİSİZ HÂLE GETİRİLDİN",
		Parent = death,
	})
	refs.deathText = label({
		Position = UDim2.fromOffset(0, 40),
		Size = UDim2.new(1, 0, 0, 22),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 16,
		RichText = true,
		Parent = death,
	})
	refs.deathTimer = label({
		Position = UDim2.fromOffset(0, 64),
		Size = UDim2.new(1, 0, 0, 20),
		TextXAlignment = Enum.TextXAlignment.Center,
		TextSize = 13,
		TextColor3 = C.dim,
		Parent = death,
	})
	refs.death = death
end

function Menu.build(playerGui, camera, cb)
	callbacks = cb or {}
	gui = make("ScreenGui", {
		Name = "Menu",
		IgnoreGuiInset = false,
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = 5,
		Parent = playerGui,
	})
	-- Birinci şahıs kamerada fareyi serbest bırakmak için (Modal)
	refs.modal = make("TextButton", {
		Name = "MouseUnlock",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Text = "",
		Modal = true,
		AutoButtonColor = false,
		Parent = gui,
	})
	local canvas = Ui.canvas(gui, camera)
	refs.canvas = canvas

	local root = frame({
		Name = "Root",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(980, 556),
		BackgroundTransparency = 1,
		Parent = canvas,
	})
	refs.root = root

	local header = frame(
		{ Size = UDim2.new(1, 0, 0, 58), BackgroundColor3 = C.ink, BackgroundTransparency = 0.15, Parent = root },
		{ Ui.corner(8) }
	)
	label({
		Position = UDim2.fromOffset(16, 6),
		Size = UDim2.fromOffset(400, 30),
		TextSize = 28,
		Font = Ui.FontBlack,
		Text = string.upper(Config.GameName),
		Parent = header,
	})
	label({
		Position = UDim2.fromOffset(16, 34),
		Size = UDim2.fromOffset(400, 16),
		TextSize = 12,
		TextColor3 = C.dim,
		Font = Ui.FontMedium,
		Text = "Teçhizatını seç, takımına katıl.",
		Parent = header,
	})
	refs.modeName = label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -16, 0, 8),
		Size = UDim2.fromOffset(520, 24),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextSize = 20,
		Font = Ui.FontBlack,
		TextColor3 = C.accent,
		Parent = header,
	})
	refs.phaseText = label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -16, 0, 33),
		Size = UDim2.fromOffset(520, 18),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextSize = 13,
		Font = Ui.FontMedium,
		Parent = header,
	})

	local body = frame({
		Position = UDim2.fromOffset(0, 70),
		Size = UDim2.new(1, 0, 1, -70),
		BackgroundTransparency = 1,
		Parent = root,
	})
	buildWeaponList(body)
	buildDetail(body)
	buildSide(body)

	refs.ggCover = frame({
		Name = "GunGameNote",
		Size = UDim2.new(0, 692, 1, 0),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.1,
		Visible = false,
		Parent = body,
	}, {
		Ui.corner(8),
		label({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.42),
			Size = UDim2.new(1, -60, 0, 30),
			TextXAlignment = Enum.TextXAlignment.Center,
			TextSize = 24,
			Font = Ui.FontBlack,
			TextColor3 = C.accent,
			Text = "SİLAH YARIŞI",
		}),
		label({
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0.42, 26),
			Size = UDim2.new(1, -80, 0, 60),
			TextXAlignment = Enum.TextXAlignment.Center,
			TextYAlignment = Enum.TextYAlignment.Top,
			TextWrapped = true,
			TextSize = 15,
			Font = Ui.FontMedium,
			Text = "Bu turda teçhizat seçilmez. Herkes aynı silahla başlar; her leş bir sonraki silahı verir. Son silah bıçaktır, onunla leş alan kazanır. Bıçaklanan bir seviye geri düşer.",
		}),
	})

	refs.result = frame({
		Name = "Result",
		Size = UDim2.new(1, 0, 0, 58),
		BackgroundColor3 = C.accent,
		Visible = false,
		Parent = root,
	}, { Ui.corner(8) })
	refs.resultTitle = label({
		Position = UDim2.fromOffset(16, 4),
		Size = UDim2.new(1, -32, 0, 30),
		TextSize = 26,
		Font = Ui.FontBlack,
		TextColor3 = C.ink,
		Parent = refs.result,
	})
	refs.resultText = label({
		Position = UDim2.fromOffset(16, 34),
		Size = UDim2.new(1, -32, 0, 18),
		TextSize = 13,
		Font = Ui.FontMedium,
		TextColor3 = C.ink,
		Parent = refs.result,
	})

	buildDeath(canvas)
	Menu.refresh()
	return gui
end

local function attachmentChip(weaponId, slot, attId, parent, order)
	local def = Weapons.Defs[weaponId]
	local current = loadout.attachments[weaponId] and loadout.attachments[weaponId][slot] or nil
	local active = current == attId
	local unlocked = attId == nil or Loadout.attachmentUnlocked(profile, weaponId, attId)
	local att = attId and Attachments.Defs[attId]
	local text = att and att.name or "Yok"
	if not unlocked then
		local have = profile.weaponKills[weaponId] or 0
		text = string.format("%s · %d/%d", att.name, have, att.unlockKills)
	end
	local chip = button({
		LayoutOrder = order,
		Size = UDim2.fromOffset(att and 104 or 52, 30),
		AutomaticSize = Enum.AutomaticSize.None,
		BackgroundColor3 = active and C.accent or (unlocked and C.panel2 or C.ink),
		TextColor3 = active and C.ink or (unlocked and C.text or C.dim),
		TextSize = 11,
		TextWrapped = true,
		Text = text,
		Parent = parent,
	}, { Ui.corner(5) })
	chip.MouseEnter:Connect(function()
		refs.attachInfo.Text = att
				and (att.name .. ": " .. att.info .. (unlocked and "" or string.format(
					"  (Bu silahla %d leş gerekli)",
					att.unlockKills
				)))
			or "Eklenti takılmaz."
	end)
	chip.Activated:Connect(function()
		if not unlocked or def.melee then
			refs.attachInfo.Text = att
					and string.format("%s kilitli: %s ile %d leş al.", att.name, def.name, att.unlockKills)
				or ""
			return
		end
		local slots = loadout.attachments[weaponId] or {}
		slots[slot] = attId
		loadout.attachments[weaponId] = slots
		queueSave()
		Menu.refresh()
	end)
end

-- Seçili silah ya da eklentileri değiştiyse önizleme modelini yeniden kurar
local function updatePreview(weaponId, stats)
	local preview = refs.preview
	local key = weaponId
	for _, slot in ipairs(Attachments.Slots) do
		key ..= ":" .. tostring(stats.attachments[slot])
	end
	if preview.key == key then
		return
	end
	preview.key = key
	if preview.model then
		preview.model:Destroy()
	end
	local model = GunModels.build(stats, { name = "Preview" })
	model.Parent = preview.world
	preview.model = model
	local length = stats.model.length
	-- Silahın kabaca ortası: tutamağın önünde, boyunun yarısı kadar
	preview.center = 0.45 - length * 0.42
	local distance = math.max(1.6, length * 1.05)
	preview.camera.CFrame = CFrame.lookAt(Vector3.new(0, 0.35, distance), Vector3.new(0, 0.05, 0))
end

local function spinPreview()
	local preview = refs.preview
	if not preview or not preview.model then
		return
	end
	local angle = math.rad(90) + math.sin(os.clock() * 0.7) * 0.55
	preview.model:PivotTo(CFrame.Angles(0, angle, 0) * CFrame.new(0, 0, -preview.center))
end

function Menu.refresh()
	if not gui then
		return
	end
	-- Silah listesi
	for id, entry in pairs(weaponButtons) do
		local def = Weapons.Defs[id]
		local unlocked = Loadout.weaponUnlocked(profile, id)
		local equipped = loadout.primary == id or loadout.secondary == id
		entry.button.BackgroundColor3 = equipped and C.line or C.panel2
		entry.stroke.Transparency = selected == id and 0 or 1
		entry.name.TextColor3 = unlocked and C.text or C.dim
		if not unlocked then
			entry.tag.Text = "Rütbe " .. def.unlockRank
			entry.tag.TextColor3 = C.dim
		elseif equipped then
			entry.tag.Text = "SEÇİLİ"
			entry.tag.TextColor3 = C.accent
		else
			local kills = profile.weaponKills[id] or 0
			entry.tag.Text = kills > 0 and (kills .. " leş") or ""
			entry.tag.TextColor3 = C.dim
		end
	end

	-- Ayrıntı
	local def = Weapons.Defs[selected]
	local stats = Weapons.resolve(selected, loadout.attachments[selected])
	refs.detailName.Text = def.name
	local unlocked = Loadout.weaponUnlocked(profile, selected)
	refs.detailClass.Text = def.classLabel
		.. (
			unlocked and ""
			or ("  ·  " .. def.unlockRank .. ". rütbede açılır (" .. Ranks.name(def.unlockRank) .. ")")
		)
	refs.detailText.Text = def.description
	updatePreview(selected, stats)
	spinPreview()
	for index, bar in ipairs(Menu.statBars(stats)) do
		local item = refs.bars[index]
		item.name.Text = bar[1]
		item.fill.Size = UDim2.fromScale(bar[2], 1)
		item.value.Text = tostring(math.floor(bar[2] * 100 + 0.5))
	end
	refs.detailFacts.Text = string.format(
		"%s  ·  %d/%d mermi  ·  %d atış/dk  ·  dolum %.1f sn",
		FIRE_MODE[stats.fireMode] or "",
		stats.magSize,
		stats.reserve,
		stats.rpm,
		stats.reloadTime
	)
	for _, slot in ipairs(Attachments.Slots) do
		local row = refs.slots[slot].row
		for _, child in ipairs(row:GetChildren()) do
			if child:IsA("GuiButton") or child:IsA("TextLabel") then
				child:Destroy()
			end
		end
		local options = Attachments.optionsFor(def, slot)
		if #options == 0 then
			label({ Size = UDim2.fromOffset(200, 30), Text = "—", TextColor3 = C.dim, TextSize = 14, Parent = row })
		else
			attachmentChip(selected, slot, nil, row, 0)
			for index, attId in ipairs(options) do
				attachmentChip(selected, slot, attId, row, index)
			end
		end
	end

	-- Profil
	local fraction, toNext, rank = Ranks.progress(profile.xp)
	refs.rankNumber.Text = tostring(rank)
	refs.rankName.Text = Ranks.name(rank)
	refs.rankNext.Text = rank >= Ranks.Max and "En yüksek rütbe" or string.format("Sonraki rütbeye %d puan", toNext)
	refs.xpFill.Size = UDim2.fromScale(fraction, 1)
	local kd = profile.deaths > 0 and profile.kills / profile.deaths or profile.kills
	refs.stats.Text = string.format(
		"Leş <b>%d</b>   Ölüm <b>%d</b>   L/Ö <b>%.2f</b>\nKafadan <b>%d</b>   Zafer <b>%d</b> / %d tur\nToplam puan <b>%d</b>",
		profile.kills,
		profile.deaths,
		kd,
		profile.headshots,
		profile.wins,
		profile.matches,
		profile.xp
	)
end

function Menu.setProfile(data)
	if type(data) ~= "table" then
		return
	end
	profile = data
	profile.weaponKills = profile.weaponKills or {}
	if data.loadout and not saveQueued then
		loadout = copyLoadout(data.loadout)
	end
	Menu.refresh()
end

function Menu.loadout()
	return copyLoadout(loadout)
end

-- "menu": teçhizat ekranı, "death": ölüm şeridi, "hidden": kapalı
function Menu.setView(view)
	open = view == "menu"
	if not gui then
		return
	end
	gui.Enabled = view ~= "hidden"
	refs.root.Visible = open
	refs.modal.Visible = open
	refs.death.Visible = view == "death"
	if open then
		Menu.refresh()
	end
end

function Menu.isOpen()
	return open
end

function Menu.setDeath(text, timerText)
	if not gui then
		return
	end
	refs.deathText.Text = text or ""
	refs.deathTimer.Text = timerText or ""
end

-- d: { modeName, modeInfo, phase, timeText, ffa, canDeploy, deployText,
--      result = { title, text, color } | nil, tips }
function Menu.update(d)
	if not gui or not open then
		return
	end
	spinPreview()
	refs.modeName.Text = d.modeName or ""
	refs.phaseText.Text = d.phaseText or ""
	refs.ggCover.Visible = d.gunGame == true
	deployEnabled = d.canDeploy == true
	refs.deploy.BackgroundColor3 = deployEnabled and C.accent or C.line
	refs.deploy.AutoButtonColor = deployEnabled
	refs.deploy.Text = deployEnabled and "SAVAŞA KATIL" or "BEKLE"
	refs.deploySub.Text = d.deployText or ""
	refs.infoTitle.Text = d.infoTitle or ""
	refs.infoText.Text = d.infoText or ""
	local result = d.result
	refs.result.Visible = result ~= nil
	if result then
		refs.resultTitle.Text = result.title
		refs.resultText.Text = result.text or ""
		refs.result.BackgroundColor3 = result.color or C.accent
	end
end

return Menu
