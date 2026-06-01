(function () {
  const STORAGE_KEY = "eye-care-checkin-state-v1";
  const defaultTimes = {
    1: ["09:00"],
    2: ["09:00", "21:00"],
    3: ["08:00", "14:00", "21:00"],
    4: ["08:00", "12:00", "18:00", "22:00"],
    5: ["08:00", "11:00", "14:00", "18:00", "22:00"],
    6: ["07:30", "10:30", "13:30", "16:30", "19:30", "22:30"]
  };
  const followTemplates = [
    { id: "day1", label: "术后 1 天复查", offsetDays: 1 },
    { id: "week1", label: "术后 1 周复查", offsetDays: 7 },
    { id: "month1", label: "术后 1 个月复查", offsetDays: 30 },
    { id: "month3", label: "术后 3 个月复查", offsetDays: 90 },
    { id: "month6", label: "术后 6 个月复查", offsetDays: 180 },
    { id: "year1", label: "术后 1 年复查", offsetDays: 365 }
  ];

  let state = loadState();
  let activeTab = "today";
  let toastTimer = 0;

  const app = document.getElementById("app");

  function todayISO() {
    return toISODate(new Date());
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(iso, days) {
    const date = parseDate(iso);
    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  function formatDate(iso, options) {
    return parseDate(iso).toLocaleDateString("zh-CN", options || {
      month: "short",
      day: "numeric",
      weekday: "short"
    });
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadState() {
    const fallback = {
      medicines: [],
      logs: {},
      surgeryDate: todayISO(),
      followUps: followTemplates.map((item) => ({ ...item, enabled: true }))
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        followUps: parsed.followUps && parsed.followUps.length ? parsed.followUps : fallback.followUps
      };
    } catch (error) {
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setState(nextState) {
    state = nextState;
    saveState();
    render();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    const oldToast = document.querySelector(".toast");
    if (oldToast) oldToast.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    toastTimer = setTimeout(() => toast.remove(), 2200);
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function activeMedicinesOn(date) {
    return state.medicines.filter((medicine) => {
      const endDate = addDays(medicine.startDate, Number(medicine.durationDays) - 1);
      return medicine.startDate <= date && date <= endDate;
    });
  }

  function logKey(medicineId, date, time) {
    return `${medicineId}|${date}|${time}`;
  }

  function buildTasks(date) {
    return activeMedicinesOn(date)
      .flatMap((medicine) =>
        medicine.times.map((time) => ({
          medicine,
          date,
          time,
          key: logKey(medicine.id, date, time)
        }))
      )
      .sort((a, b) => a.time.localeCompare(b.time) || a.medicine.name.localeCompare(b.medicine.name));
  }

  function completionStats(date) {
    const tasks = buildTasks(date);
    const done = tasks.filter((task) => state.logs[task.key]).length;
    return { total: tasks.length, done, remaining: Math.max(tasks.length - done, 0) };
  }

  function toggleDose(key, medicineName) {
    const logs = { ...state.logs };
    if (logs[key]) {
      delete logs[key];
      showToast(`已取消 ${medicineName} 的打卡`);
    } else {
      logs[key] = { doneAt: new Date().toISOString() };
      showToast(`${medicineName} 已打卡`);
    }
    setState({ ...state, logs });
  }

  function addMedicine(form) {
    const fields = form.elements;
    const timesPerDay = Math.max(1, Math.min(6, Number(fields.timesPerDay.value) || 1));
    const times = Array.from(form.querySelectorAll("[data-time-input]"))
      .map((input) => input.value)
      .filter(Boolean)
      .slice(0, timesPerDay);

    const medicine = {
      id: uid(),
      name: fields.name.value.trim(),
      startDate: fields.startDate.value || todayISO(),
      durationDays: Math.max(1, Number(fields.durationDays.value) || 1),
      timesPerDay,
      times: times.length ? times : defaultTimes[timesPerDay]
    };

    if (!medicine.name) {
      showToast("请先输入药品名称");
      return;
    }

    setState({ ...state, medicines: [...state.medicines, medicine] });
    showToast("已添加用药提醒");
  }

  function deleteMedicine(id) {
    const medicine = state.medicines.find((item) => item.id === id);
    const logs = Object.fromEntries(
      Object.entries(state.logs).filter(([key]) => !key.startsWith(`${id}|`))
    );
    setState({
      ...state,
      medicines: state.medicines.filter((item) => item.id !== id),
      logs
    });
    showToast(`${medicine ? medicine.name : "药品"} 已删除`);
  }

  function updateTimesInputs(count) {
    const container = document.getElementById("times-inputs");
    if (!container) return;
    const times = defaultTimes[count] || defaultTimes[4];
    container.innerHTML = times
      .slice(0, count)
      .map((time, index) => `
        <label>
          第 ${index + 1} 次时间
          <input data-time-input type="time" value="${time}" />
        </label>
      `)
      .join("");
  }

  function removeFollowUp(id) {
    setState({
      ...state,
      followUps: state.followUps.map((item) =>
        item.id === id ? { ...item, enabled: false } : item
      )
    });
    showToast("已删除该复诊提醒");
  }

  function restoreFollowUps() {
    setState({
      ...state,
      followUps: state.followUps.map((item) => ({ ...item, enabled: true }))
    });
    showToast("已恢复默认复诊提醒");
  }

  function icsDate(date, time) {
    return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
  }

  function escapeICS(value) {
    return String(value)
      .replaceAll("\\", "\\\\")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;")
      .replaceAll("\n", "\\n");
  }

  function buildMedicineEvents() {
    const events = [];
    state.medicines.forEach((medicine) => {
      for (let day = 0; day < Number(medicine.durationDays); day += 1) {
        const date = addDays(medicine.startDate, day);
        medicine.times.forEach((time) => {
          events.push({
            uid: `${medicine.id}-${date}-${time}@eye-care-checkin`,
            summary: `滴药：${medicine.name}`,
            description: `术后用药提醒。完成后回到网页点击药品名打卡。`,
            start: icsDate(date, time),
            end: icsDate(date, addMinutes(time, 5)),
            alarms: ["-PT10M"]
          });
        });
      }
    });
    return events;
  }

  function buildFollowEvents() {
    if (!state.surgeryDate) return [];
    return state.followUps
      .filter((item) => item.enabled)
      .map((item) => {
        const date = addDays(state.surgeryDate, item.offsetDays);
        return {
          uid: `follow-${item.id}-${date}@eye-care-checkin`,
          summary: item.label,
          description: "近视手术后复诊提醒，请以医生要求为准。",
          start: icsDate(date, "09:00"),
          end: icsDate(date, "09:30"),
          alarms: ["-P1D", "-PT2H"]
        };
      });
  }

  function addMinutes(time, minutes) {
    const [hour, minute] = time.split(":").map(Number);
    const date = new Date(2000, 0, 1, hour, minute + minutes);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function downloadICS(events, filename) {
    if (!events.length) {
      showToast("没有可导出的提醒");
      return;
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Eye Care Checkin//ZH-CN",
      "CALSCALE:GREGORIAN"
    ];

    events.forEach((event) => {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${event.uid}`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART:${event.start}`);
      lines.push(`DTEND:${event.end}`);
      lines.push(`SUMMARY:${escapeICS(event.summary)}`);
      lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
      event.alarms.forEach((trigger) => {
        lines.push("BEGIN:VALARM");
        lines.push(`TRIGGER:${trigger}`);
        lines.push("ACTION:DISPLAY");
        lines.push(`DESCRIPTION:${escapeICS(event.summary)}`);
        lines.push("END:VALARM");
      });
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showToast("已生成日历文件，iPhone 打开后可加入日历");
  }

  function render() {
    const stats = completionStats(todayISO());
    const today = new Date();
    app.innerHTML = `
      <main class="app-shell">
        <section class="hero">
          <div>
            <p class="eyebrow">术后用药打卡</p>
            <h1>今天滴药<br />完成了吗？</h1>
            <p class="hero-note">本工具只做提醒和记录，用药安排请以医生医嘱为准。</p>
          </div>
          <div class="date-pill">
            <strong>${today.getDate()}</strong>
            <span>${today.toLocaleDateString("zh-CN", { month: "short", weekday: "short" })}</span>
          </div>
        </section>

        <section class="stats">
          <div class="stat"><b>${stats.done}</b><span>已打卡</span></div>
          <div class="stat"><b>${stats.remaining}</b><span>待完成</span></div>
          <div class="stat"><b>${state.medicines.length}</b><span>药品</span></div>
        </section>

        ${renderCurrentTab()}
      </main>

      <nav class="bottom-nav">
        <div class="nav-inner">
          ${navButton("today", "✓", "今日")}
          ${navButton("medicine", "+", "药品")}
          ${navButton("follow", "⌁", "复诊")}
          ${navButton("history", "◷", "记录")}
        </div>
      </nav>
    `;
    bindEvents();
  }

  function navButton(tab, icon, label) {
    return `
      <button class="nav-button ${activeTab === tab ? "active" : ""}" data-tab="${tab}">
        <span>${icon}</span>${label}
      </button>
    `;
  }

  function renderCurrentTab() {
    if (activeTab === "medicine") return renderMedicineTab();
    if (activeTab === "follow") return renderFollowTab();
    if (activeTab === "history") return renderHistoryTab();
    return renderTodayTab();
  }

  function renderTodayTab() {
    const tasks = buildTasks(todayISO());
    const grouped = groupBy(tasks, "time");
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">今日用药</h2>
            <p class="panel-subtitle">点击药品卡片即可打卡，再点一次取消。</p>
          </div>
          <button class="button secondary" data-export="medicine">导入提醒</button>
        </div>
        ${
          tasks.length
            ? Object.entries(grouped).map(([time, items]) => `
              <div class="time-group">
                <p class="time-label">${time}</p>
                ${items.map(renderDoseCard).join("")}
              </div>
            `).join("")
            : `<div class="empty">还没有今日用药。先在“药品”里添加药品名称、天数和每日次数。</div>`
        }
      </section>
    `;
  }

  function renderDoseCard(task) {
    const log = state.logs[task.key];
    return `
      <button class="dose-card ${log ? "done" : ""}" data-dose-key="${task.key}" data-dose-name="${escapeHTML(task.medicine.name)}">
        <span>
          <span class="dose-name">${escapeHTML(task.medicine.name)}</span>
          <span class="dose-meta">${log ? `已打卡 ${new Date(log.doneAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "未打卡"}</span>
        </span>
        <span class="checkmark">${log ? "✓" : ""}</span>
      </button>
    `;
  }

  function renderMedicineTab() {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">添加药品</h2>
            <p class="panel-subtitle">设置用药天数、每日次数和提醒时间。</p>
          </div>
        </div>
        <form id="medicine-form" class="form-grid">
          <label>药品名称<input name="name" placeholder="例如 左氧氟沙星滴眼液" autocomplete="off" /></label>
          <label>开始日期<input name="startDate" type="date" value="${todayISO()}" /></label>
          <label>使用多少天<input name="durationDays" type="number" min="1" max="365" value="7" /></label>
          <label>一天几次<input id="times-per-day" name="timesPerDay" type="number" min="1" max="6" value="4" /></label>
          <div id="times-inputs" class="times-grid">
            ${defaultTimes[4].map((time, index) => `
              <label>第 ${index + 1} 次时间<input data-time-input type="time" value="${time}" /></label>
            `).join("")}
          </div>
          <button class="button" type="submit">添加用药提醒</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">药品列表</h2>
            <p class="panel-subtitle">删除药品会同时删除它的打卡记录。</p>
          </div>
        </div>
        ${
          state.medicines.length
            ? state.medicines.map(renderMedicineCard).join("")
            : `<div class="empty">暂无药品。添加后会自动出现在今日打卡页。</div>`
        }
      </section>
    `;
  }

  function renderMedicineCard(medicine) {
    const endDate = addDays(medicine.startDate, Number(medicine.durationDays) - 1);
    return `
      <article class="medicine-card">
        <div class="card-row">
          <div>
            <h3 class="medicine-name">${escapeHTML(medicine.name)}</h3>
            <p class="card-meta">${formatDate(medicine.startDate)} 至 ${formatDate(endDate)}，共 ${medicine.durationDays} 天</p>
          </div>
          <button class="button danger" data-delete-medicine="${medicine.id}">删除</button>
        </div>
        <div class="tag-list">
          ${medicine.times.map((time) => `<span class="tag">${time}</span>`).join("")}
        </div>
      </article>
    `;
  }

  function renderFollowTab() {
    const activeFollowUps = state.followUps.filter((item) => item.enabled);
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">复诊提醒</h2>
            <p class="panel-subtitle">输入手术日期后，自动生成常见复诊时间。</p>
          </div>
        </div>
        <label>手术日期<input id="surgery-date" type="date" value="${state.surgeryDate || todayISO()}" /></label>
        <div class="actions">
          <button class="button" data-export="follow">导入复诊日历</button>
          <button class="button secondary" data-restore-follow>恢复默认</button>
        </div>
      </section>

      <section class="panel">
        ${
          activeFollowUps.length
            ? activeFollowUps.map((item) => {
              const date = addDays(state.surgeryDate || todayISO(), item.offsetDays);
              return `
                <article class="follow-card">
                  <div>
                    <p class="follow-date">${formatDate(date, { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })}</p>
                    <p class="card-meta">${item.label}</p>
                  </div>
                  <button class="button danger" data-delete-follow="${item.id}">删除</button>
                </article>
              `;
            }).join("")
            : `<div class="empty">复诊提醒已全部删除，可以点击“恢复默认”重新生成。</div>`
        }
      </section>
    `;
  }

  function renderHistoryTab() {
    const dates = Array.from({ length: 14 }, (_, index) => addDays(todayISO(), -index));
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">打卡记录</h2>
            <p class="panel-subtitle">显示最近 14 天的用药完成情况。</p>
          </div>
        </div>
        ${dates.map(renderHistoryDate).join("")}
      </section>
    `;
  }

  function renderHistoryDate(date) {
    const tasks = buildTasks(date);
    const done = tasks.filter((task) => state.logs[task.key]).length;
    return `
      <article class="history-card">
        <div class="history-head">
          <span>${formatDate(date, { month: "2-digit", day: "2-digit", weekday: "short" })}</span>
          <span>${done}/${tasks.length}</span>
        </div>
        ${
          tasks.length
            ? tasks.map((task) => {
              const log = state.logs[task.key];
              return `
                <div class="mini-log ${log ? "done" : ""}">
                  <span>${task.time} ${escapeHTML(task.medicine.name)}</span>
                  <span>${log ? `已打卡 ${new Date(log.doneAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "未打卡"}</span>
                </div>
              `;
            }).join("")
            : `<div class="mini-log"><span>无用药安排</span><span></span></div>`
        }
      </article>
    `;
  }

  function groupBy(items, field) {
    return items.reduce((groups, item) => {
      groups[item[field]] = groups[item[field]] || [];
      groups[item[field]].push(item);
      return groups;
    }, {});
  }

  function bindEvents() {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        activeTab = button.dataset.tab;
        render();
      });
    });

    document.querySelectorAll("[data-dose-key]").forEach((button) => {
      button.addEventListener("click", () => toggleDose(button.dataset.doseKey, button.dataset.doseName));
    });

    document.querySelectorAll("[data-delete-medicine]").forEach((button) => {
      button.addEventListener("click", () => deleteMedicine(button.dataset.deleteMedicine));
    });

    document.querySelectorAll("[data-delete-follow]").forEach((button) => {
      button.addEventListener("click", () => removeFollowUp(button.dataset.deleteFollow));
    });

    const medicineForm = document.getElementById("medicine-form");
    if (medicineForm) {
      medicineForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addMedicine(medicineForm);
      });
    }

    const timesInput = document.getElementById("times-per-day");
    if (timesInput) {
      timesInput.addEventListener("change", () => {
        const count = Math.max(1, Math.min(6, Number(timesInput.value) || 1));
        timesInput.value = count;
        updateTimesInputs(count);
      });
    }

    const surgeryDate = document.getElementById("surgery-date");
    if (surgeryDate) {
      surgeryDate.addEventListener("change", () => {
        setState({ ...state, surgeryDate: surgeryDate.value || todayISO() });
      });
    }

    const restoreFollow = document.querySelector("[data-restore-follow]");
    if (restoreFollow) {
      restoreFollow.addEventListener("click", restoreFollowUps);
    }

    document.querySelectorAll("[data-export]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.export === "follow") {
          downloadICS(buildFollowEvents(), "follow-up-reminders.ics");
        } else {
          downloadICS(buildMedicineEvents(), "medicine-reminders.ics");
        }
      });
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  render();
})();
